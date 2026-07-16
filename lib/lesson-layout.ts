import type { Card } from "./schemas";
import type { BlockDensity, BlockImportance, BlockIntent } from "./block-presentation";
import type { QuizCard } from "./learning-types";

export type LessonBlockSize = "compact" | "medium" | "wide";
export type LessonBlockKind = BlockIntent;

export type LessonBlockMeta = {
  kind: LessonBlockKind;
  label: string;
  size: LessonBlockSize;
  importance: BlockImportance;
  density: BlockDensity;
};

export type LessonMomentEntry = {
  card: Card;
  cardIndex: number;
};

export type LessonMoment = {
  id: string;
  entries: LessonMomentEntry[];
  title: string;
};

export function isLessonQuiz(card: Card): card is QuizCard {
  return card.type === "quiz_mcq" || card.type === "quiz_truefalse" || card.type === "quiz_fillblank";
}

const intentLabels: Record<LessonBlockKind, string> = {
  idea: "Key idea",
  insight: "Insight",
  example: "Example",
  summary: "Summary",
  quiz: "Knowledge check",
  quote: "Story / quote",
  glossary: "Glossary",
  "case-study": "Case study",
  challenge: "Challenge",
  reflection: "Reflection",
  media: "Source detail",
  "creator-note": "Creator note",
};

const densitySizes: Record<BlockDensity, LessonBlockSize> = {
  compact: "compact",
  balanced: "medium",
  immersive: "wide",
};

function fallbackBlockMeta(card: Card, cardIndex: number): Pick<LessonBlockMeta, "kind" | "size" | "importance" | "density"> {
  if (card.type === "concept") return cardIndex % 3 === 0
    ? { kind: "idea", size: "medium", importance: "core", density: "balanced" }
    : { kind: "insight", size: "medium", importance: "core", density: "balanced" };
  if (card.type === "example") return { kind: "example", size: "compact", importance: "supporting", density: "compact" };
  if (card.type === "recap") return { kind: "summary", size: "wide", importance: "core", density: "immersive" };
  if (isLessonQuiz(card)) return { kind: "quiz", size: "wide", importance: "critical", density: "immersive" };
  if (card.type === "story") return { kind: "quote", size: "wide", importance: "supporting", density: "immersive" };
  if (card.type === "flashcard") return { kind: "glossary", size: "compact", importance: "supporting", density: "compact" };
  if (card.type === "scenario") return { kind: "case-study", size: "wide", importance: "critical", density: "immersive" };
  if (card.type === "practical_task") return { kind: "challenge", size: "wide", importance: "critical", density: "immersive" };
  if (card.type === "discussion" || card.type === "survey") return { kind: "reflection", size: card.type === "discussion" ? "medium" : "wide", importance: "core", density: card.type === "discussion" ? "balanced" : "immersive" };
  if (card.type === "image" || card.type === "audio_video") return { kind: "media", size: "wide", importance: "supporting", density: "immersive" };
  return { kind: "creator-note", size: "compact", importance: "supporting", density: "compact" };
}

export function lessonBlockMeta(card: Card, cardIndex = 0): LessonBlockMeta {
  const fallback = fallbackBlockMeta(card, cardIndex);
  const kind = card.intent ?? fallback.kind;
  const density = card.density ?? fallback.density;
  const importance = card.importance ?? fallback.importance;
  const size = card.density ? densitySizes[density] : importance === "critical" ? "wide" : fallback.size;
  return { kind, label: intentLabels[kind], size, importance, density };
}

export function lessonBlockPurpose(kind: LessonBlockKind) {
  const purposes: Record<LessonBlockKind, string> = {
    idea: "Core concept",
    insight: "Worth remembering",
    example: "Applied context",
    summary: "Quick recap",
    quiz: "Retrieval practice",
    quote: "Story lens",
    glossary: "Term to learn",
    "case-study": "Applied decision",
    challenge: "Try it yourself",
    reflection: "Pause and reflect",
    media: "Visual source",
    "creator-note": "From the creator",
  };
  return purposes[kind];
}

export function lessonBlockMinutes(meta: LessonBlockMeta) {
  return meta.density === "compact" ? 1 : meta.density === "balanced" ? 2 : 3;
}

export function lessonMomentGuidance(moment: LessonMoment) {
  const kinds = moment.entries.map((entry) => lessonBlockMeta(entry.card, entry.cardIndex).kind);
  if (kinds.includes("quiz")) return "Retrieve the idea before moving on.";
  if (kinds.includes("challenge") || kinds.includes("case-study")) return "Apply the idea in a realistic decision.";
  if (kinds.includes("reflection")) return "Pause, connect, and make the idea your own.";
  if (kinds.includes("summary")) return "Collect the signals worth carrying forward.";
  return "Read, connect, and build the next idea.";
}

export function lessonCardTitle(card: Card) {
  if (card.type === "concept" || card.type === "example" || card.type === "recap" || card.type === "story" || card.type === "audio_video" || card.type === "practical_task" || card.type === "survey") return card.title;
  if (card.type === "quiz_mcq") return card.question;
  if (card.type === "quiz_truefalse") return card.statement;
  if (card.type === "quiz_fillblank") return "Choose the missing idea";
  if (card.type === "flashcard") return card.front;
  if (card.type === "scenario") return card.decisionPrompt;
  if (card.type === "discussion") return card.prompt;
  if (card.type === "attestation") return card.statement;
  return card.caption || "Visual reference";
}

const standaloneTypes = new Set<Card["type"]>([
  "image",
  "audio_video",
  "story",
  "scenario",
  "practical_task",
  "survey",
]);

export function buildLessonMoments(cards: Card[]): LessonMoment[] {
  const moments: LessonMoment[] = [];
  let entries: LessonMomentEntry[] = [];

  const flush = () => {
    if (entries.length === 0) return;
    const first = entries[0];
    moments.push({
      id: `moment-${moments.length + 1}-${first.cardIndex}`,
      entries,
      title: lessonCardTitle(first.card),
    });
    entries = [];
  };

  cards.forEach((card, cardIndex) => {
    // Retrieval checks become their own focused interludes. Keeping the source
    // cards out of the same moment asks learners to recall, not simply copy.
    if (isLessonQuiz(card)) {
      flush();
      entries = [{ card, cardIndex }];
      flush();
      return;
    }

    const meta = lessonBlockMeta(card, cardIndex);
    if (standaloneTypes.has(card.type) || (meta.size === "wide" && (card.importance === "critical" || card.density === "immersive"))) {
      flush();
      entries = [{ card, cardIndex }];
      flush();
      return;
    }

    if (entries.length >= 3) flush();
    entries.push({ card, cardIndex });
    if (card.type === "recap") flush();
  });

  flush();
  return moments;
}
