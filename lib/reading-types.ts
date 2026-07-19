import type { CourseAppearance } from "./course-appearance";

export const READING_VIBE_IDS = [
  "archive-glow",
  "clear-day",
  "garden-notes",
  "modern-atlas",
  "night-ink",
  "story-path",
  "cosmic-margin",
] as const;

export type ReadingVibeId = (typeof READING_VIBE_IDS)[number];
export type ReadingUnitKind = "page" | "chapter" | "section";
export type ReadingAtmosphereMode = "auto" | "paper" | "night" | "focus";

export interface ReadingVibeDefinition {
  id: ReadingVibeId;
  name: string;
  description: string;
  appearance: CourseAppearance;
}

export interface ReadingEditionProfile {
  version: "reading-vibe-v1";
  vibeId: ReadingVibeId;
  matchedBy: "source-signal" | "stable-fallback";
  wordCount: number;
  estimatedMinutes: number;
  unitCount: number;
  unitKind: ReadingUnitKind;
}

export interface ReadingUnitOutline {
  index: number;
  title: string;
  wordCount: number;
}

export interface ReadingProgress {
  unitIndex: number;
  unitProgress: number;
  overallProgress: number;
  updatedAt: string;
  /** Deterministic local anchor; older servers safely ignore this field. */
  passageId?: string;
}

export interface ReadingEditionListItem {
  id: number;
  title: string;
  sourceFilename: string;
  sourceChapterCount: number;
  wordCount: number;
  estimatedMinutes: number;
  unitKind: ReadingUnitKind;
  vibeId: ReadingVibeId;
  coverHash: string | null;
  createdAt: string;
  progress: ReadingProgress | null;
}

export interface ReadingEditionMetadata extends ReadingEditionListItem {
  outline: ReadingUnitOutline[];
  profile: ReadingEditionProfile;
}

export interface ReadingUnit {
  index: number;
  title: string;
  text: string;
  wordCount: number;
  previousTitle: string | null;
  nextTitle: string | null;
}

export interface ReadingSearchResult {
  index: number;
  title: string;
  snippet: string;
}
