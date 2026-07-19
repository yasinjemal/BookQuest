import { z } from "zod/v4";

export const SUMMARY_STATUSES = [
  "extracting",
  "outlining",
  "generating",
  "ready",
  "error",
] as const;

export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

export const SUMMARY_GENERATION_STALE_MS = 210_000;

export function isSummaryGenerationStalled(
  summary: {
    status: SummaryStatus;
    generation_heartbeat: string | null;
    updated_at: string;
    created_at: string;
  },
  nowMs: number = Date.now()
): boolean {
  if (!new Set<SummaryStatus>(["extracting", "outlining", "generating"]).has(summary.status)) {
    return false;
  }
  const lastActive = Date.parse(
    summary.generation_heartbeat || summary.updated_at || summary.created_at
  );
  return !Number.isFinite(lastActive) || nowMs - lastActive >= SUMMARY_GENERATION_STALE_MS;
}

export const SUMMARY_DOCUMENT_KINDS = [
  "nonfiction",
  "narrative",
  "technical",
  "research",
  "policy",
  "other",
] as const;

export type SummaryDocumentKind = (typeof SUMMARY_DOCUMENT_KINDS)[number];

const SummaryDocumentKindSchema = z.enum(SUMMARY_DOCUMENT_KINDS);

const SummaryOutlineSection = z.object({
  title: z
    .string()
    .min(1)
    .max(100)
    .describe("A clear, inviting section title, at most 10 words"),
  hook: z
    .string()
    .min(1)
    .max(300)
    .describe("One sentence explaining the question or shift this section explores"),
  chapter_indexes: z
    .array(z.number().int().nonnegative())
    .min(1)
    .describe(
      "Zero-based source chapter indexes assigned to this section, in reading order"
    ),
});

/** The first durable generation result: a whole-document map whose chapter
 * assignments are validated before any section rows are created. */
export const SummaryOutline = z.object({
  title: z
    .string()
    .min(1)
    .max(140)
    .describe("A concise title for this guided summary"),
  description: z
    .string()
    .min(1)
    .max(420)
    .describe("One sentence describing what the reader will understand"),
  thesis: z
    .string()
    .min(1)
    .max(1600)
    .describe(
      "A faithful whole-document synthesis of the central argument, story, or purpose"
    ),
  document_kind: SummaryDocumentKindSchema.describe(
    "The source structure that should guide the summary treatment"
  ),
  estimated_minutes: z
    .number()
    .int()
    .min(5)
    .max(120)
    .describe("Estimated minutes to read the completed deep summary"),
  sections: z
    .array(SummaryOutlineSection)
    .min(1)
    .max(48)
    .describe(
      "A reading-order journey through the source; every source chapter must appear exactly once"
    ),
});

export type SummaryOutline = z.infer<typeof SummaryOutline>;

const CitationIds = z
  .array(z.string().min(1).max(40))
  .min(1)
  .describe("IDs of citations in this section that directly support the statement");

const SummaryGroundedIdea = z.object({
  title: z.string().min(1).max(100),
  explanation: z
    .string()
    .min(1)
    .max(3200)
    .describe("A plain-language explanation in original prose, not a long quotation"),
  why_it_matters: z
    .string()
    .min(1)
    .max(1200)
    .describe("Why this source-grounded idea changes the reader's understanding"),
  citation_ids: CitationIds,
});

const SummarySourceExample = z.object({
  title: z.string().min(1).max(100),
  explanation: z
    .string()
    .min(1)
    .max(2200)
    .describe("A concise retelling of an example, episode, case, or piece of evidence"),
  lesson: z.string().min(1).max(1000),
  citation_ids: CitationIds,
});

const SummaryNuance = z.object({
  point: z
    .string()
    .min(1)
    .max(1600)
    .describe("A limitation, tension, exception, or counterpoint found in the source"),
  citation_ids: CitationIds,
});

const SummaryApplication = z.object({
  action: z
    .string()
    .min(1)
    .max(1200)
    .describe("A practical implication that follows from the source, without adding new facts"),
  citation_ids: CitationIds,
});

const SummaryChapterRecap = z.object({
  chapter_index: z.number().int().nonnegative(),
  source_chapter: z.string().min(1).max(300),
  summary: z
    .string()
    .min(1)
    .max(1800)
    .describe("What this source chapter contributes to the section's larger thread"),
  citation_ids: CitationIds,
});

const SummaryCitation = z.object({
  id: z.string().min(1).max(40),
  chapter_index: z.number().int().nonnegative(),
  source_chapter: z.string().min(1).max(300),
  locator: z
    .string()
    .min(1)
    .max(240)
    .describe("A human-readable source location such as a chapter or section heading"),
  supporting_excerpt: z
    .string()
    .min(1)
    .max(280)
    .describe("A short exact excerpt from the source; never a long quotation"),
});

/** One generated section. Citations are deliberately first-class so the reader
 * can preview evidence and later deep-link into a page-aware source viewer. */
export const SummarySectionContent = z.object({
  takeaway: z
    .string()
    .min(1)
    .max(500)
    .describe("The section's central idea in one memorable sentence"),
  overview: z
    .string()
    .min(1)
    .max(8000)
    .describe("A connected, accessible explanation of this section's source material"),
  key_ideas: z.array(SummaryGroundedIdea).min(2).max(8),
  source_examples: z.array(SummarySourceExample).max(6),
  connections: z
    .array(z.string().min(1).max(1200))
    .max(6)
    .describe("Connections among ideas inside this section; no outside facts"),
  nuances: z.array(SummaryNuance).max(6),
  practical_applications: z.array(SummaryApplication).max(6),
  chapter_recap: z
    .array(SummaryChapterRecap)
    .min(1)
    .describe("Exactly one recap for every source chapter assigned to this section"),
  closing_reflection: z.string().min(1).max(1200),
  citations: z.array(SummaryCitation).min(1).max(80),
});

export type SummarySectionContent = z.infer<typeof SummarySectionContent>;

export interface SummaryListItem {
  id: number;
  title: string;
  description: string;
  source_filename: string;
  status: SummaryStatus;
  error: string | null;
  document_kind: SummaryDocumentKind;
  estimated_minutes: number;
  section_count: number;
  ready_section_count: number;
  source_chapter_count: number;
  course_id: number | null;
  created_at: string;
  generation_stalled: boolean;
}

export type SummarySectionStatus = "pending" | "generating" | "ready" | "error";

export interface SummarySectionDetail {
  id: number;
  title: string;
  hook: string;
  position: number;
  chapter_indexes: number[];
  source_chapters: string[];
  status: SummarySectionStatus;
  content: SummarySectionContent | null;
}

export interface SummaryDetail extends SummaryListItem {
  thesis: string;
  sections: SummarySectionDetail[];
}
