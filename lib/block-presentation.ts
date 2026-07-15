import { z } from "zod/v4";

export const BLOCK_INTENTS = [
  "idea",
  "insight",
  "example",
  "summary",
  "quiz",
  "quote",
  "glossary",
  "case-study",
  "challenge",
  "reflection",
  "media",
  "creator-note",
] as const;

export const BLOCK_IMPORTANCE = ["supporting", "core", "critical"] as const;
export const BLOCK_DENSITIES = ["compact", "balanced", "immersive"] as const;

export const BlockPresentationSchema = z.object({
  intent: z.enum(BLOCK_INTENTS).optional().describe("The instructional purpose of this block. Choose the closest semantic role instead of relying on its position."),
  importance: z.enum(BLOCK_IMPORTANCE).optional().describe("How strongly this block should be emphasized: supporting, core, or critical."),
  density: z.enum(BLOCK_DENSITIES).optional().describe("The intended reading footprint: compact, balanced, or immersive."),
});

export const blockPresentationFields = BlockPresentationSchema.shape;

export type BlockIntent = (typeof BLOCK_INTENTS)[number];
export type BlockImportance = (typeof BLOCK_IMPORTANCE)[number];
export type BlockDensity = (typeof BLOCK_DENSITIES)[number];
export type BlockPresentation = z.infer<typeof BlockPresentationSchema>;
