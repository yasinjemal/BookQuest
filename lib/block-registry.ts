import { z } from "zod/v4";
import { BlockPresentationSchema } from "./block-presentation";

const nonEmpty = z.string().trim().min(1);
const legacyConcept = z.object({ type: z.literal("concept"), title: nonEmpty, body: nonEmpty });
const legacyExample = z.object({ type: z.literal("example"), title: nonEmpty, body: nonEmpty });
const legacyMcq = z.object({
  type: z.literal("quiz_mcq"),
  question: nonEmpty,
  options: z.array(nonEmpty).min(2),
  correct_index: z.number().int().nonnegative(),
  explanation: nonEmpty,
  concept: z.string().optional(),
});
const legacyTrueFalse = z.object({
  type: z.literal("quiz_truefalse"),
  statement: nonEmpty,
  answer: z.boolean(),
  explanation: nonEmpty,
  concept: z.string().optional(),
});
const legacyFill = z.object({
  type: z.literal("quiz_fillblank"),
  sentence: nonEmpty,
  answer: nonEmpty,
  accepted_answers: z.array(z.string()),
  explanation: nonEmpty,
  concept: z.string().optional(),
});
const legacyRecap = z.object({
  type: z.literal("recap"),
  title: nonEmpty,
  points: z.array(nonEmpty).min(1),
});

export const BLOCK_SCHEMAS = {
  explanation: z.union([
    legacyConcept,
    z.object({ type: z.literal("explanation"), heading: nonEmpty, body: nonEmpty }),
  ]),
  image: z.object({
    type: z.literal("image"),
    url: nonEmpty,
    altText: z.string(),
    decorative: z.boolean().default(false),
    caption: z.string().optional(),
  }),
  audio_video: z.object({
    type: z.literal("audio_video"),
    url: nonEmpty,
    title: nonEmpty,
    captions: z.string().optional(),
    transcript: z.string().optional(),
  }),
  story: z.object({ type: z.literal("story"), title: nonEmpty, body: nonEmpty }),
  worked_example: z.union([
    legacyExample,
    z.object({
      type: z.literal("worked_example"),
      title: nonEmpty,
      problem: nonEmpty,
      steps: z.array(nonEmpty).min(1),
      result: nonEmpty,
    }),
  ]),
  flashcard: z.object({
    type: z.literal("flashcard"),
    front: nonEmpty,
    back: nonEmpty,
    frontLabel: nonEmpty,
    backLabel: nonEmpty,
  }),
  multiple_choice: z.union([
    legacyMcq,
    z.object({
      type: z.literal("multiple_choice"),
      concept: z.string().optional(),
      question: nonEmpty,
      options: z.array(nonEmpty).min(2),
      correctIndex: z.number().int().nonnegative(),
      explanation: nonEmpty,
    }),
  ]),
  true_false: z.union([
    legacyTrueFalse,
    z.object({
      type: z.literal("true_false"),
      concept: z.string().optional(),
      statement: nonEmpty,
      answer: z.boolean(),
      explanation: nonEmpty,
    }),
  ]),
  fill_in: z.union([
    legacyFill,
    z.object({
      type: z.literal("fill_in"),
      concept: z.string().optional(),
      prompt: nonEmpty,
      answer: nonEmpty,
      acceptedAnswers: z.array(z.string()).default([]),
      explanation: nonEmpty,
    }),
  ]),
  scenario: z.object({
    type: z.literal("scenario"),
    context: nonEmpty,
    decisionPrompt: nonEmpty,
    options: z.array(nonEmpty).optional(),
    guidance: z.string().optional(),
  }),
  practical_task: z.object({
    type: z.literal("practical_task"),
    title: nonEmpty,
    instructions: z.array(nonEmpty).min(1),
    submissionAlternative: nonEmpty,
    rubric: z.array(nonEmpty).default([]),
  }),
  discussion: z.object({
    type: z.literal("discussion"),
    prompt: nonEmpty,
    privateAlternative: nonEmpty,
  }),
  survey: z.object({
    type: z.literal("survey"),
    title: nonEmpty,
    questions: z.array(
      z.object({ id: nonEmpty, label: nonEmpty, responseType: z.enum(["text", "scale", "choice"]) })
    ).min(1),
  }),
  attestation: z.object({
    type: z.literal("attestation"),
    statement: nonEmpty,
    consentLabel: nonEmpty,
    required: z.boolean().default(true),
  }),
  recap: z.union([
    legacyRecap,
    z.object({ type: z.literal("recap"), heading: nonEmpty, points: z.array(nonEmpty).min(1) }),
  ]),
} as const;

export type BlockType = keyof typeof BLOCK_SCHEMAS;

export const BLOCK_CHANNELS: Readonly<
  Record<BlockType, { offline: boolean; chat: boolean; fallback: BlockType | null }>
> = {
  explanation: { offline: true, chat: true, fallback: null },
  image: { offline: true, chat: false, fallback: "explanation" },
  audio_video: { offline: false, chat: false, fallback: "explanation" },
  story: { offline: true, chat: true, fallback: "explanation" },
  worked_example: { offline: true, chat: true, fallback: "explanation" },
  flashcard: { offline: true, chat: true, fallback: "explanation" },
  multiple_choice: { offline: true, chat: true, fallback: null },
  true_false: { offline: true, chat: true, fallback: null },
  fill_in: { offline: true, chat: true, fallback: null },
  scenario: { offline: true, chat: true, fallback: "explanation" },
  practical_task: { offline: true, chat: false, fallback: "explanation" },
  discussion: { offline: true, chat: true, fallback: "explanation" },
  survey: { offline: true, chat: true, fallback: "explanation" },
  attestation: { offline: true, chat: true, fallback: "explanation" },
  recap: { offline: true, chat: true, fallback: "explanation" },
};

export function validateBlockContent(
  blockType: string,
  content: unknown
): { valid: boolean; issues: string[] } {
  const schema = BLOCK_SCHEMAS[blockType as BlockType];
  if (!schema) return { valid: false, issues: ["Unknown block type"] };
  const result = schema.safeParse(content);
  if (!result.success) {
    return {
      valid: false,
      issues: result.error.issues.map((issue) => `${issue.path.join(".") || "content"}: ${issue.message}`),
    };
  }
  const value = result.data as Record<string, unknown>;
  const issues: string[] = [];
  const presentation = BlockPresentationSchema.safeParse(content);
  if (!presentation.success) {
    issues.push(...presentation.error.issues.map((issue) => `${issue.path.join(".") || "presentation"}: ${issue.message}`));
  }
  if (blockType === "image" && !value.decorative && !String(value.altText ?? "").trim()) {
    issues.push("Image requires alt text unless marked decorative");
  }
  if (
    blockType === "audio_video" &&
    !String(value.captions ?? "").trim() &&
    !String(value.transcript ?? "").trim()
  ) {
    issues.push("Audio/video requires captions or a transcript");
  }
  return { valid: issues.length === 0, issues };
}
