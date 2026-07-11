import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  createLesson,
  createModule,
  setCourseMeta,
  setCourseStatus,
  setModuleStatus,
} from "./db";
import type { Chapter } from "./extract";
import { Card, CourseOutline, ModuleLessons } from "./schemas";

const MODEL = "claude-opus-4-8";

const client = new Anthropic();

const SYSTEM = `You turn books and documents into bite-size, gamified micro-learning courses in the style of Duolingo and Sololearn. Your learners are often on mobile phones with limited data, and English may be their second language.

Rules for all content you write:
- Plain, simple English. Short sentences. Explain any technical term the first time it appears.
- One idea per card. Never cram.
- Quizzes must test understanding of what was just taught, not trivia or wording.
- Stay faithful to the source document. Do not invent facts that are not in it.
- Be warm and encouraging, never condescending.`;

/**
 * Full pipeline: outline the course, then generate lessons module by module.
 * Persists incrementally so a partially generated course is already usable.
 */
export async function generateCourse(courseId: number, chapters: Chapter[]) {
  try {
    setCourseStatus(courseId, "outlining");

    const chapterList = chapters
      .map((c, i) => `[${i}] ${c.title} — ${c.text.slice(0, 300).replace(/\n+/g, " ")}...`)
      .join("\n");

    const outlineResp = await client.messages.parse({
      model: MODEL,
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

    setCourseMeta(courseId, outline.title, outline.description);
    setCourseStatus(courseId, "generating");

    const moduleIds: number[] = [];
    for (let i = 0; i < outline.modules.length; i++) {
      const m = outline.modules[i];
      moduleIds.push(createModule(courseId, m.title, m.summary, i));
    }

    // Generate lessons module by module, persisting as each completes
    for (let i = 0; i < outline.modules.length; i++) {
      const m = outline.modules[i];
      const moduleId = moduleIds[i];
      const sourceText = m.chapter_indexes
        .filter((idx) => idx >= 0 && idx < chapters.length)
        .map((idx) => `## ${chapters[idx].title}\n\n${chapters[idx].text}`)
        .join("\n\n")
        .slice(0, 60000);

      try {
        await generateModuleLessons(moduleId, m.title, sourceText);
        setModuleStatus(moduleId, "ready");
      } catch (err) {
        // One retry, then mark the module failed but keep going
        try {
          await generateModuleLessons(moduleId, m.title, sourceText);
          setModuleStatus(moduleId, "ready");
        } catch {
          console.error(`Module ${moduleId} generation failed:`, err);
          setModuleStatus(moduleId, "error");
        }
      }
    }

    setCourseStatus(courseId, "ready");
  } catch (err) {
    console.error("Course generation failed:", err);
    let message = err instanceof Error ? err.message : String(err);
    if (/authentication|api.?key|x-api-key/i.test(message)) {
      message =
        "No API key found. Paste your Anthropic API key into .env.local, restart the app, then tap Retry.";
    }
    setCourseStatus(courseId, "error", message);
  }
}

async function generateModuleLessons(
  moduleId: number,
  moduleTitle: string,
  sourceText: string
) {
  const resp = await client.messages.parse({
    model: MODEL,
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

  parsed.lessons.forEach((lesson, idx) => {
    // Validate each card defensively; drop malformed ones rather than fail the module
    const cards = lesson.cards.filter((c) => Card.safeParse(c).success);
    if (cards.length >= 4) {
      createLesson(moduleId, lesson.title, idx, JSON.stringify(cards));
    }
  });
}
