import type { ReadingProgress } from "./reading-types";

export type ReadingDisplayBlockKind = "heading" | "paragraph" | "list" | "quote";

export interface ReadingDisplayBlock {
  id: string;
  kind: ReadingDisplayBlockKind;
  text: string;
  items: string[];
  ordered: boolean;
  headingLevel: 2 | 3 | 4 | null;
  wordCount: number;
  signal: number;
  phase: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function stableReadingHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function words(value: string) {
  return value.trim().match(/\S+/gu)?.length ?? 0;
}

function passageSignal(value: string, wordCount: number) {
  const sentenceCount = Math.max(1, value.match(/[.!?](?:\s|$)/gu)?.length ?? 1);
  const punctuationCount = value.match(/[,:;!?—–-]/gu)?.length ?? 0;
  const sentenceRhythm = clamp(sentenceCount / Math.max(1, wordCount / 18), 0.35, 1.7);
  return clamp(0.24 + sentenceRhythm * 0.24 + Math.min(0.3, punctuationCount / Math.max(12, wordCount)), 0.2, 0.92);
}

function structuralBlock(value: string) {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  return /^(#{1,4})\s+([^\n]+)$/u.test(value)
    || (lines.length > 0 && lines.every((line) => /^[-*]\s+/u.test(line)))
    || (lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/u.test(line)))
    || (lines.length > 0 && lines.every((line) => /^>\s?/u.test(line)));
}

function groupParts(parts: string[], targetWords = 95, maximumWords = 130) {
  const groups: string[] = [];
  let current = "";
  let currentWords = 0;
  for (const part of parts) {
    const partWords = words(part);
    if (current && currentWords + partWords > maximumWords && currentWords >= 32) {
      groups.push(current.trim());
      current = "";
      currentWords = 0;
    }
    current += part;
    currentWords += partWords;
    if (currentWords >= targetWords) {
      groups.push(current.trim());
      current = "";
      currentWords = 0;
    }
  }
  if (current.trim()) {
    const previousWords = groups.length > 0 ? words(groups[groups.length - 1]) : 0;
    if (groups.length > 0 && currentWords < 32 && previousWords + currentWords <= maximumWords) groups[groups.length - 1] = `${groups[groups.length - 1]} ${current.trim()}`;
    else groups.push(current.trim());
  }
  return groups;
}

function boundedProseBlocks(value: string) {
  if (structuralBlock(value) || words(value) <= 145) return [value];
  const sentences = [...value.matchAll(/[^.!?]+(?:[.!?]+(?:["'”’)]*)|$)\s*/gu)]
    .map((match) => match[0])
    .filter((sentence) => sentence.trim());
  if (sentences.length > 1) {
    const boundedSentences = sentences.flatMap((sentence) => {
      if (words(sentence) <= 130) return [sentence];
      const wordRuns = [...sentence.matchAll(/\S+(?:\s+|$)/gu)].map((match) => match[0]);
      return groupParts(wordRuns, 110);
    });
    return groupParts(boundedSentences);
  }
  const wordRuns = [...value.matchAll(/\S+(?:\s+|$)/gu)].map((match) => match[0]);
  return groupParts(wordRuns, 110);
}

/**
 * Builds a conservative display model from the stored source text. The source
 * itself is never rewritten: this only identifies safe block-level semantics
 * and gives each block a deterministic anchor for local position restoration.
 */
export function parseReadingDisplayBlocks(source: string): ReadingDisplayBlock[] {
  const rawBlocks = source
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap(boundedProseBlocks);
  const occurrences = new Map<string, number>();

  return rawBlocks.map((raw) => {
    const heading = raw.match(/^(#{1,4})\s+([^\n]+)$/u);
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    const unordered = lines.length > 0 && lines.every((line) => /^[-*]\s+/u.test(line));
    const ordered = lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/u.test(line));
    const quote = lines.length > 0 && lines.every((line) => /^>\s?/u.test(line));
    const kind: ReadingDisplayBlockKind = heading
      ? "heading"
      : unordered || ordered
        ? "list"
        : quote
          ? "quote"
          : "paragraph";
    const text = heading
      ? heading[2]
      : quote
        ? lines.map((line) => line.replace(/^>\s?/u, "")).join("\n")
        : raw;
    const items = kind === "list"
      ? lines.map((line) => line.replace(/^(?:[-*]|\d+[.)])\s+/u, ""))
      : [];
    const normalized = `${kind}:${text.replace(/\s+/gu, " ").trim()}`;
    const hash = stableReadingHash(normalized).toString(36);
    const occurrence = (occurrences.get(hash) ?? 0) + 1;
    occurrences.set(hash, occurrence);
    const wordCount = words(kind === "list" ? items.join(" ") : text);

    return {
      id: `passage-${hash}-${occurrence}`,
      kind,
      text,
      items,
      ordered,
      headingLevel: heading ? clamp(heading[1].length + 1, 2, 4) as 2 | 3 | 4 : null,
      wordCount,
      signal: passageSignal(text, wordCount),
      phase: (stableReadingHash(`${normalized}:phase`) % 1000) / 1000,
    };
  });
}

export function remainingReadingMinutes(
  blocks: readonly ReadingDisplayBlock[],
  activeIndex: number,
  wordsPerMinute = 230
) {
  if (blocks.length === 0) return 0;
  const safeIndex = clamp(activeIndex, 0, blocks.length - 1);
  const remainingWords = blocks.slice(safeIndex).reduce((total, block) => total + block.wordCount, 0);
  return remainingWords > 0 ? Math.max(1, Math.ceil(remainingWords / wordsPerMinute)) : 0;
}

export function readingUnitProgress(
  blocks: readonly ReadingDisplayBlock[],
  activeIndex: number,
  passageFraction: number
) {
  if (blocks.length === 0) return 0;
  const safeIndex = clamp(activeIndex, 0, blocks.length - 1);
  const totalWords = Math.max(1, blocks.reduce((total, block) => total + block.wordCount, 0));
  const completedWords = blocks.slice(0, safeIndex).reduce((total, block) => total + block.wordCount, 0);
  const activeWords = blocks[safeIndex].wordCount * clamp(passageFraction, 0, 1);
  return clamp(((completedWords + activeWords) / totalWords) * 100, 0, 100);
}

export function readingBookProgress(
  outline: readonly { index: number; wordCount: number }[],
  activeUnitIndex: number,
  unitProgress: number
) {
  const totalWords = outline.reduce((total, item) => total + Math.max(0, item.wordCount), 0);
  if (totalWords <= 0) return 0;
  const completedWords = outline.reduce(
    (total, item) => item.index < activeUnitIndex ? total + Math.max(0, item.wordCount) : total,
    0
  );
  const activeWords = Math.max(0, outline.find((item) => item.index === activeUnitIndex)?.wordCount ?? 0);
  return clamp(((completedWords + activeWords * clamp(unitProgress, 0, 100) / 100) / totalWords) * 100, 0, 100);
}

export function reconcileReadingProgress(
  server: ReadingProgress | null,
  local: ReadingProgress | null
) {
  if (!server) return local;
  if (!local) return server;
  const localTime = Date.parse(local.updatedAt);
  const serverTime = Date.parse(server.updatedAt);
  if (!Number.isFinite(localTime)) return server;
  if (!Number.isFinite(serverTime)) return local;
  const newest = localTime > serverTime ? local : server;
  const other = newest === local ? server : local;
  if (
    !newest.passageId && other.passageId
    && newest.unitIndex === other.unitIndex
    && Math.abs(newest.unitProgress - other.unitProgress) <= 2
  ) {
    return { ...newest, passageId: other.passageId };
  }
  return newest;
}
