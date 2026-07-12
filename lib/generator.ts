import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  claimNextModule,
  countModules,
  countUnfinishedModules,
  createLesson,
  createModule,
  bumpCourseGenerationAttempts,
  getGenerationCourse,
  recoverStuckModules,
  setCourseMeta,
  setCourseStatus,
  setModuleStatus,
  touchGenerationHeartbeat,
} from "./db";
import type { Chapter } from "./extract";
import { Card, CourseOutline, ModuleLessons, PracticeQuiz } from "./schemas";
import {
  operationalSubject,
  recordOperationalError,
  recordOperationalEvent,
} from "./observability";

export const GENERATOR_MODEL = "claude-opus-4-8";
export const COURSE_LESSON_PROMPT_VERSION = "course-lessons-v1";
export const PRACTICE_PROMPT_VERSION = "practice-weak-concepts-v1";

/** A module gets this many attempts across the whole durable run before it is
 *  marked failed; the outline gets this many too before the course fails. */
export const MAX_MODULE_ATTEMPTS = 3;
export const MAX_OUTLINE_ATTEMPTS = 3;

const client = new Anthropic();

function apiKeyMessage(raw: string): string {
  return /authentication|api.?key|x-api-key/i.test(raw)
    ? "No API key found. Add your Anthropic API key (ANTHROPIC_API_KEY), then tap Retry."
    : raw;
}

function moduleSourceText(chapters: Chapter[], indexes: number[]): string {
  return indexes
    .filter((idx) => idx >= 0 && idx < chapters.length)
    .map((idx) => `## ${chapters[idx].title}\n\n${chapters[idx].text}`)
    .join("\n\n")
    .slice(0, 60000);
}

const SYSTEM = `You turn books and documents into bite-size, gamified micro-learning courses in the style of Duolingo and Sololearn. Your learners are often on mobile phones with limited data, and English may be their second language.

Rules for all content you write:
- Plain, simple English. Short sentences. Explain any technical term the first time it appears.
- One idea per card. Never cram.
- Quizzes must test understanding of what was just taught, not trivia or wording.
- Stay faithful to the source document. Do not invent facts that are not in it.
- Be warm and encouraging, never condescending.`;

/** Outline the whole document into modules (one Claude call). */
async function generateOutline(chapters: Chapter[]) {
  const chapterList = chapters
    .map((c, i) => `[${i}] ${c.title} — ${c.text.slice(0, 300).replace(/\n+/g, " ")}...`)
    .join("\n");

  const outlineResp = await client.messages.parse({
    model: GENERATOR_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here are the chapters of a document (index, title, and opening excerpt):\n\n${chapterList}\n\nDesign a course outline that covers this document. Group related chapters into 4-12 modules in reading order. Every chapter index must be assigned to exactly one module.`,
      },
    ],
    output_config: { format: zodOutputFormat(CourseOutline) },
  });

  const outline = outlineResp.parsed_output;
  if (!outline) throw new Error("Outline generation returned no parsable output.");
  return outline;
}

export type GenerationStep = "continue" | "done";

/**
 * Advance a course's generation by exactly one unit of work, driven entirely by
 * database state so any worker can resume it. One step is either: the outline
 * (create the modules), one module's lessons, or finalizing the course. Callers
 * must hold the course's generation lock so only one chain runs at a time.
 */
export async function runGenerationStep(courseId: number): Promise<GenerationStep> {
  const course = await getGenerationCourse(courseId);
  if (!course || course.status === "ready" || course.status === "error") return "done";
  // Still extracting (or no stored source yet) — not ready to generate.
  if (!course.source_json) return "done";

  await touchGenerationHeartbeat(courseId);
  const chapters = JSON.parse(course.source_json) as Chapter[];

  // ---- Step 1: outline → create modules ----
  if ((await countModules(courseId)) === 0) {
    try {
      await setCourseStatus(courseId, "outlining");
      await recordOperationalEvent({
        eventType: "ai.request",
        severity: "info",
        area: "course.outline",
        subjectKey: operationalSubject("course", courseId),
        metadata: { model: GENERATOR_MODEL, prompt_version: "course-outline-v1" },
      });
      const outline = await generateOutline(chapters);
      await setCourseMeta(courseId, outline.title, outline.description);
      for (let i = 0; i < outline.modules.length; i++) {
        const m = outline.modules[i];
        await createModule(courseId, m.title, m.summary, i, m.chapter_indexes);
      }
      await setCourseStatus(courseId, "generating");
      return "continue";
    } catch (err) {
      console.error(`Course ${courseId} outline failed:`, err);
      await recordOperationalError({
        eventType: "ai.failure",
        area: "course.outline",
        error: err,
        subjectKey: operationalSubject("course", courseId),
        metadata: { model: GENERATOR_MODEL },
      });
      const attempts = await bumpCourseGenerationAttempts(courseId);
      if (attempts >= MAX_OUTLINE_ATTEMPTS) {
        await setCourseStatus(
          courseId,
          "error",
          apiKeyMessage(err instanceof Error ? err.message : String(err))
        );
        return "done";
      }
      throw err; // let the chain retry the outline in a fresh invocation
    }
  }

  // ---- Step 2: generate the next pending module ----
  const claimed = await claimNextModule(courseId, MAX_MODULE_ATTEMPTS);
  if (claimed) {
    try {
      const sourceText = moduleSourceText(chapters, claimed.chapter_indexes);
      await recordOperationalEvent({
        eventType: "ai.request",
        severity: "info",
        area: "course.module",
        subjectKey: operationalSubject("course", courseId),
        metadata: {
          model: GENERATOR_MODEL,
          prompt_version: COURSE_LESSON_PROMPT_VERSION,
        },
      });
      await generateModuleLessons(claimed.id, claimed.title, sourceText);
      await setModuleStatus(claimed.id, "ready");
    } catch (err) {
      console.error(`Module ${claimed.id} generation failed:`, err);
      await recordOperationalError({
        eventType: "ai.failure",
        area: "course.module",
        error: err,
        subjectKey: operationalSubject("course", courseId),
        metadata: { model: GENERATOR_MODEL },
      });
      // Give up on this module after its final attempt; otherwise release it.
      await setModuleStatus(
        claimed.id,
        claimed.attempts >= MAX_MODULE_ATTEMPTS ? "error" : "pending"
      );
    }
    await touchGenerationHeartbeat(courseId);
    return "continue";
  }

  // ---- Step 3: finalize ----
  // Nothing left to claim. If no modules are unfinished, the course is ready
  // (even if some modules ended in 'error' — a partial course is still usable).
  if ((await countUnfinishedModules(courseId)) === 0) {
    await setCourseStatus(courseId, "ready");
    return "done";
  }
  return "continue";
}

/**
 * Run generation steps until the course is finished or the time budget runs out.
 * Returns true when the course reached a terminal state, false if more work
 * remains (the caller should schedule a fresh invocation to continue).
 */
export async function runGenerationUntilBudget(
  courseId: number,
  deadlineMs: number
): Promise<boolean> {
  await recoverStuckModules(courseId, MAX_MODULE_ATTEMPTS);
  while (Date.now() < deadlineMs) {
    const step = await runGenerationStep(courseId);
    if (step === "done") return true;
  }
  return false;
}

/** Fresh, never-seen practice questions targeting a learner's weakest
    concepts — the premium half of the mastery engine. */
export async function generatePracticeQuiz(
  courseTitle: string,
  weakConcepts: string[],
  sourceText: string
): Promise<Card[]> {
  const resp = await client.messages.parse({
    model: GENERATOR_MODEL,
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `A learner studying "${courseTitle}" is weak on these concepts: ${weakConcepts
          .map((c) => `"${c}"`)
          .join(", ")}.\n\nCourse material:\n\n${sourceText.slice(0, 30000)}\n\nWrite 6 brand-new quiz questions (mix of multiple choice, true/false, fill-in-the-blank) that test exactly these weak concepts from fresh angles. Tag each question's "concept" field with the matching concept string from the list above.`,
      },
    ],
    output_config: { format: zodOutputFormat(PracticeQuiz) },
  });
  const parsed = resp.parsed_output;
  if (!parsed) throw new Error("Practice generation returned no parsable output.");
  return parsed.cards.filter((c) => Card.safeParse(c).success) as Card[];
}

async function generateModuleLessons(
  moduleId: number,
  moduleTitle: string,
  sourceText: string
) {
  const resp = await client.messages.parse({
    model: GENERATOR_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Source material for the module "${moduleTitle}":\n\n${sourceText}\n\nCreate 2-4 lessons teaching this material. Each lesson: 8-14 cards, at least 40% quiz cards, starting with concept cards, quizzes interleaved after every 1-2 concepts, ending with a recap card. Cover the important ideas of the source — skip filler.`,
      },
    ],
    output_config: { format: zodOutputFormat(ModuleLessons) },
  });

  const parsed = resp.parsed_output;
  if (!parsed) throw new Error("Lesson generation returned no parsable output.");

  for (let idx = 0; idx < parsed.lessons.length; idx++) {
    const lesson = parsed.lessons[idx];
    // Validate each card defensively; drop malformed ones rather than fail the module
    const cards = lesson.cards.filter((c) => Card.safeParse(c).success);
    if (cards.length >= 4) {
      await createLesson(moduleId, lesson.title, idx, JSON.stringify(cards), {
        generatorModel: GENERATOR_MODEL,
        promptVersion: COURSE_LESSON_PROMPT_VERSION,
      });
    }
  }
}
