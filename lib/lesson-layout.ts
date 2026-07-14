import type { Card } from "./schemas";

export type LessonBlockSize = "compact" | "medium" | "wide";
export type LessonBlockKind =
  | "idea"
  | "insight"
  | "example"
  | "summary"
  | "quiz"
  | "quote"
  | "glossary"
  | "case-study"
  | "challenge"
  | "reflection"
  | "media"
  | "creator-note";

export type LessonBlockMeta = {
  kind: LessonBlockKind;
  label: string;
  size: LessonBlockSize;
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

export function isLessonQuiz(card: Card) {
  return card.type === "quiz_mcq" || card.type === "quiz_truefalse" || card.type === "quiz_fillblank";
}

export function lessonBlockMeta(card: Card, cardIndex = 0): LessonBlockMeta {
  if (card.type === "concept") return cardIndex % 3 === 0
    ? { kind: "idea", label: "Key idea", size: "medium" }
    : { kind: "insight", label: "Insight", size: "medium" };
  if (card.type === "example") return { kind: "example", label: "Example", size: "compact" };
  if (card.type === "recap") return { kind: "summary", label: "Summary", size: "wide" };
  if (isLessonQuiz(card)) return { kind: "quiz", label: "Knowledge check", size: "wide" };
  if (card.type === "story") return { kind: "quote", label: "Story / quote", size: "wide" };
  if (card.type === "flashcard") return { kind: "glossary", label: "Glossary", size: "compact" };
  if (card.type === "scenario") return { kind: "case-study", label: "Case study", size: "wide" };
  if (card.type === "practical_task") return { kind: "challenge", label: "Challenge", size: "wide" };
  if (card.type === "discussion" || card.type === "survey") return { kind: "reflection", label: "Reflection", size: card.type === "discussion" ? "medium" : "wide" };
  if (card.type === "image" || card.type === "audio_video") return { kind: "media", label: "Source detail", size: "wide" };
  return { kind: "creator-note", label: "Creator note", size: "compact" };
}

export function lessonCardTitle(card: Card) {
  if (card.type === "concept" || card.type === "example" || card.type === "recap" || card.type === "story" || card.type === "audio_video" || card.type === "practical_task" || card.type === "survey") return card.title;
  if (card.type === "quiz_mcq") return card.question;
  if (card.type === "quiz_truefalse") return card.statement;
  if (card.type === "quiz_fillblank") return "Complete the thought";
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
    if (standaloneTypes.has(card.type)) {
      flush();
      entries = [{ card, cardIndex }];
      flush();
      return;
    }

    if (entries.length >= 3) flush();
    entries.push({ card, cardIndex });
    if (isLessonQuiz(card) || card.type === "recap") flush();
  });

  flush();
  return moments;
}
