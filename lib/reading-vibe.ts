import type { Chapter } from "./extract";
import { COURSE_APPEARANCE_TEMPLATES } from "./course-appearance";
import type {
  ReadingAtmosphereMode,
  ReadingEditionProfile,
  ReadingUnitKind,
  ReadingVibeDefinition,
  ReadingVibeId,
} from "./reading-types";
import { READING_VIBE_IDS } from "./reading-types";

function appearance(template: string) {
  return COURSE_APPEARANCE_TEMPLATES.find((item) => item.id === template)!.appearance;
}

export const READING_VIBES: Record<ReadingVibeId, ReadingVibeDefinition> = {
  "archive-glow": {
    id: "archive-glow",
    name: "Archive glow",
    description: "Warm paper, bookish type, and a quiet archival atmosphere.",
    appearance: appearance("quiet-library"),
  },
  "clear-day": {
    id: "clear-day",
    name: "Clear day",
    description: "Low-distraction surfaces tuned for dense, practical reading.",
    appearance: appearance("clear-focus"),
  },
  "garden-notes": {
    id: "garden-notes",
    name: "Garden notes",
    description: "A grounded, observant reading room with a natural rhythm.",
    appearance: appearance("field-notes"),
  },
  "modern-atlas": {
    id: "modern-atlas",
    name: "Modern atlas",
    description: "Structured typography and calm wayfinding for ideas in motion.",
    appearance: appearance("modern-atlas"),
  },
  "night-ink": {
    id: "night-ink",
    name: "Night ink",
    description: "A focused charcoal room for late-night or atmospheric reading.",
    appearance: appearance("shadow-files"),
  },
  "story-path": {
    id: "story-path",
    name: "Story path",
    description: "Expressive editorial type and a gently unfolding landscape.",
    appearance: appearance("storybook"),
  },
  "cosmic-margin": {
    id: "cosmic-margin",
    name: "Cosmic margin",
    description: "Cool, precise surfaces for science, technology, and discovery.",
    appearance: appearance("science-tech"),
  },
};

const SIGNALS: ReadonlyArray<{ vibeId: ReadingVibeId; words: readonly string[] }> = [
  { vibeId: "cosmic-margin", words: ["science", "technology", "physics", "space", "universe", "computer", "engineering", "biology", "data", "future"] },
  { vibeId: "garden-notes", words: ["nature", "garden", "forest", "earth", "wellness", "healing", "mindful", "ecology", "plant", "wild"] },
  { vibeId: "modern-atlas", words: ["business", "strategy", "leadership", "finance", "market", "growth", "management", "economics", "wealth", "startup"] },
  { vibeId: "night-ink", words: ["mystery", "crime", "shadow", "dark", "night", "detective", "thriller", "secret", "horror", "noir"] },
  { vibeId: "story-path", words: ["novel", "story", "adventure", "tale", "journey", "character", "fiction", "once upon", "memoir", "romance"] },
  { vibeId: "archive-glow", words: ["history", "biography", "archive", "ancient", "heritage", "philosophy", "letters", "century", "memoir", "chronicle"] },
  { vibeId: "clear-day", words: ["manual", "guide", "policy", "research", "report", "reference", "handbook", "method", "study", "introduction"] },
];

const FALLBACK_VIBES: readonly ReadingVibeId[] = [
  "archive-glow",
  "clear-day",
  "garden-notes",
  "modern-atlas",
  "story-path",
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function cleanBookTitle(filename: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const spaced = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "Untitled book";
  if (spaced === spaced.toUpperCase() || spaced === spaced.toLowerCase()) {
    return spaced.toLowerCase().replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
  }
  return spaced;
}

export function readingWordCount(chapters: readonly Chapter[]) {
  return chapters.reduce((total, chapter) => {
    const words = chapter.text.trim().match(/\S+/gu);
    return total + (words?.length ?? 0);
  }, 0);
}

function unitKind(chapters: readonly Chapter[]): ReadingUnitKind {
  if (chapters.length > 0 && chapters.every((chapter) => /^Page\s+\d+$/i.test(chapter.title.trim()))) {
    return "page";
  }
  return chapters.length > 1 ? "chapter" : "section";
}

function boundedSourceSample(filename: string, chapters: readonly Chapter[]) {
  const headings = chapters.slice(0, 80).map((chapter) => chapter.title).join(" ");
  const joined = chapters.map((chapter) => chapter.text).join("\n");
  const middle = Math.max(0, Math.floor(joined.length / 2) - 1_500);
  return `${filename} ${headings} ${joined.slice(0, 4_000)} ${joined.slice(middle, middle + 3_000)} ${joined.slice(-4_000)}`.toLowerCase();
}

function matchedVibe(filename: string, chapters: readonly Chapter[]) {
  const sample = boundedSourceSample(filename, chapters);
  let best: { vibeId: ReadingVibeId; score: number } | null = null;
  for (const signal of SIGNALS) {
    const score = signal.words.reduce((sum, word) => sum + (sample.includes(word) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { vibeId: signal.vibeId, score };
  }
  if (best) return { vibeId: best.vibeId, matchedBy: "source-signal" as const };
  const seed = `${filename}:${chapters.length}:${chapters.map((chapter) => chapter.title).join("|")}`;
  return {
    vibeId: FALLBACK_VIBES[stableHash(seed) % FALLBACK_VIBES.length],
    matchedBy: "stable-fallback" as const,
  };
}

export function deriveReadingEditionProfile(
  filename: string,
  chapters: readonly Chapter[]
): ReadingEditionProfile {
  const words = readingWordCount(chapters);
  const match = matchedVibe(filename, chapters);
  return {
    version: "reading-vibe-v1",
    vibeId: match.vibeId,
    matchedBy: match.matchedBy,
    wordCount: words,
    estimatedMinutes: words > 0 ? Math.max(1, Math.ceil(words / 230)) : 0,
    unitCount: chapters.length,
    unitKind: unitKind(chapters),
  };
}

export function parseReadingEditionProfile(value: unknown): ReadingEditionProfile {
  let candidate = value;
  if (typeof value === "string") {
    try { candidate = JSON.parse(value); } catch { candidate = null; }
  }
  const profile = candidate && typeof candidate === "object" ? candidate as Partial<ReadingEditionProfile> : {};
  const vibeId = READING_VIBE_IDS.includes(profile.vibeId as ReadingVibeId)
    ? profile.vibeId as ReadingVibeId
    : "archive-glow";
  const kind = profile.unitKind === "page" || profile.unitKind === "chapter" || profile.unitKind === "section"
    ? profile.unitKind
    : "section";
  return {
    version: "reading-vibe-v1",
    vibeId,
    matchedBy: profile.matchedBy === "source-signal" ? "source-signal" : "stable-fallback",
    wordCount: Math.max(0, Number(profile.wordCount) || 0),
    estimatedMinutes: Math.max(0, Number(profile.estimatedMinutes) || 0),
    unitCount: Math.max(0, Number(profile.unitCount) || 0),
    unitKind: kind,
  };
}

export function readingAppearance(vibeId: ReadingVibeId, mode: ReadingAtmosphereMode) {
  if (mode === "paper") return READING_VIBES["archive-glow"].appearance;
  if (mode === "night") return READING_VIBES["night-ink"].appearance;
  if (mode === "focus") return READING_VIBES["clear-day"].appearance;
  return READING_VIBES[vibeId].appearance;
}
