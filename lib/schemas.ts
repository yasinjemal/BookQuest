import { z } from "zod/v4";
import { BLOCK_SCHEMAS } from "./block-registry";
import { blockPresentationFields } from "./block-presentation";

// ---------- Card types (what the lesson player renders) ----------

export const ConceptCard = z.object({
  ...blockPresentationFields,
  type: z.literal("concept"),
  title: z.string().describe("Short heading for the idea, max 8 words"),
  body: z
    .string()
    .describe(
      "One clear idea explained in plain English, max 80 words. No jargon without explanation."
    ),
});

export const ExampleCard = z.object({
  ...blockPresentationFields,
  type: z.literal("example"),
  title: z.string().describe("Short heading, max 8 words"),
  body: z
    .string()
    .describe("A concrete example or analogy illustrating the previous concept, max 80 words"),
});

/** The concept a quiz question tests — the atom of the mastery engine. */
const conceptField = z
  .string()
  .optional()
  .describe(
    "REQUIRED: the single concept this question tests, 1-4 lowercase words, e.g. 'compound interest'. Reuse the exact same concept string for questions testing the same idea."
  );

export const QuizMcqCard = z.object({
  ...blockPresentationFields,
  type: z.literal("quiz_mcq"),
  concept: conceptField,
  question: z.string().describe("A single clear question"),
  options: z.array(z.string()).describe("Exactly 4 answer options"),
  correct_index: z
    .number()
    .int()
    .describe("0-based index of the correct option"),
  explanation: z
    .string()
    .describe("One sentence explaining why the correct answer is right"),
});

export const QuizTrueFalseCard = z.object({
  ...blockPresentationFields,
  type: z.literal("quiz_truefalse"),
  concept: conceptField,
  statement: z.string().describe("A statement that is clearly true or false"),
  answer: z.boolean().describe("true if the statement is true"),
  explanation: z.string().describe("One sentence explanation"),
});

/** Strict shape for newly generated questions. The wider QuizMcqCard remains
 * compatible with imported and already-published courses. */
export const GeneratedQuizMcqCard = QuizMcqCard.extend({
  options: z
    .array(z.string().trim().min(1))
    .length(2)
    .describe("Exactly 2 concise options: one correct answer and one plausible distractor"),
  correct_index: z
    .number()
    .int()
    .min(0)
    .max(1)
    .describe("0-based index of the correct option; must be 0 or 1"),
});

export const QuizFillBlankCard = z.object({
  ...blockPresentationFields,
  type: z.literal("quiz_fillblank"),
  concept: conceptField,
  sentence: z
    .string()
    .describe(
      "A sentence with exactly one blank written as ___ (three underscores)"
    ),
  answer: z.string().describe("The word or short phrase that fills the blank"),
  accepted_answers: z
    .array(z.string())
    .describe("Alternative correct spellings/phrasings, may be empty"),
  explanation: z.string().describe("One sentence explanation"),
});

export const RecapCard = z.object({
  ...blockPresentationFields,
  type: z.literal("recap"),
  title: z.string().describe("Short heading, max 8 words"),
  points: z
    .array(z.string())
    .describe("2-4 bullet points summarizing the lesson's key takeaways"),
});

export const Card = z.union([
  ConceptCard,
  ExampleCard,
  QuizMcqCard,
  QuizTrueFalseCard,
  QuizFillBlankCard,
  RecapCard,
  BLOCK_SCHEMAS.image.extend(blockPresentationFields),
  BLOCK_SCHEMAS.audio_video.extend(blockPresentationFields),
  BLOCK_SCHEMAS.story.extend(blockPresentationFields),
  BLOCK_SCHEMAS.flashcard.extend(blockPresentationFields),
  BLOCK_SCHEMAS.scenario.extend(blockPresentationFields),
  BLOCK_SCHEMAS.practical_task.extend(blockPresentationFields),
  BLOCK_SCHEMAS.discussion.extend(blockPresentationFields),
  BLOCK_SCHEMAS.survey.extend(blockPresentationFields),
  BLOCK_SCHEMAS.attestation.extend(blockPresentationFields),
]);
export type Card = z.infer<typeof Card>;

/** Cards AI course generation may create. Fill-in remains readable and
 * gradeable through Card, but new generations use only two-choice checks. */
export const GeneratedLessonCard = z.union([
  ConceptCard,
  ExampleCard,
  GeneratedQuizMcqCard,
  QuizTrueFalseCard,
  RecapCard,
  BLOCK_SCHEMAS.image.extend(blockPresentationFields),
  BLOCK_SCHEMAS.audio_video.extend(blockPresentationFields),
  BLOCK_SCHEMAS.story.extend(blockPresentationFields),
  BLOCK_SCHEMAS.flashcard.extend(blockPresentationFields),
  BLOCK_SCHEMAS.scenario.extend(blockPresentationFields),
  BLOCK_SCHEMAS.practical_task.extend(blockPresentationFields),
  BLOCK_SCHEMAS.discussion.extend(blockPresentationFields),
  BLOCK_SCHEMAS.survey.extend(blockPresentationFields),
  BLOCK_SCHEMAS.attestation.extend(blockPresentationFields),
]);

// ---------- Generation output shapes ----------

export const CourseOutline = z.object({
  title: z.string().describe("Course title, max 8 words, learner-friendly"),
  description: z
    .string()
    .describe("One-sentence description of what the learner will gain"),
  modules: z
    .array(
      z.object({
        title: z.string().describe("Module title, max 8 words"),
        summary: z
          .string()
          .describe("One sentence: what this module covers"),
        chapter_indexes: z
          .array(z.number().int())
          .describe(
            "0-based indexes of the source chapters this module draws from"
          ),
      })
    )
    .describe("4-12 modules covering the whole document in order"),
});
export type CourseOutline = z.infer<typeof CourseOutline>;

/** Output shape for AI-generated fresh practice questions. */
export const PracticeQuiz = z.object({
  cards: z
    .array(z.discriminatedUnion("type", [GeneratedQuizMcqCard, QuizTrueFalseCard]))
    .describe("6 two-choice quiz cards: exactly 2-option multiple choice or true/false. Each must test one requested weak concept, tagged with that exact concept string. Never repeat a question the learner has seen — invent new angles."),
});
export type PracticeQuiz = z.infer<typeof PracticeQuiz>;

export const ModuleLessons = z.object({
  lessons: z
    .array(
      z.object({
        title: z.string().describe("Lesson title, max 8 words"),
        cards: z
          .array(GeneratedLessonCard)
          .describe(
            "8-14 cards. At least 40% must be two-choice quiz cards (quiz_mcq with exactly 2 options, or quiz_truefalse). Never generate quiz_fillblank. Start with concept cards, interleave quizzes after each 1-2 concepts, end with a recap card."
          ),
      })
    )
    .describe("2-4 lessons for this module"),
});
export type ModuleLessons = z.infer<typeof ModuleLessons>;

// ---------- DB row shapes (plain types) ----------

export type CourseStatus =
  | "extracting"
  | "outlining"
  | "generating"
  | "ready"
  | "error";

export interface CourseRow {
  id: number;
  title: string;
  description: string;
  source_filename: string;
  status: CourseStatus;
  error: string | null;
  created_at: string;
}

export interface ModuleRow {
  id: number;
  course_id: number;
  title: string;
  summary: string;
  position: number;
  status: "pending" | "generating" | "ready" | "error";
}

export interface LessonRow {
  id: number;
  module_id: number;
  title: string;
  position: number;
  cards: string; // JSON Card[]
  generator_model: string | null;
  prompt_version: string | null;
  content_version: number;
}
