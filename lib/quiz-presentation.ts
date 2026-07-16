import type { QuizCard } from "./learning-types";

export const FILL_BLANK_CLUE_CHOICE = "I need a clue";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\p{P}\p{S}]/gu, "");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isAcceptedFillBlankAnswer(
  card: Extract<QuizCard, { type: "quiz_fillblank" }>,
  answer: string
): boolean {
  const normalized = normalize(answer);
  return [card.answer, ...card.accepted_answers]
    .map(normalize)
    .includes(normalized);
}

/**
 * Older fill-in cards never stored a card-specific distractor. Present the
 * correct completion beside an honest clue path instead of inventing a choice
 * that the server might grade unfairly.
 */
export function fillBlankChoiceOptions(
  card: Extract<QuizCard, { type: "quiz_fillblank" }>
): [string, string] {
  const fallback = [FILL_BLANK_CLUE_CHOICE, "Show me the answer"]
    .find((choice) => !isAcceptedFillBlankAnswer(card, choice)) ?? "Skip this check";
  const choices: [string, string] = [card.answer, fallback];
  if (stableHash(`${card.sentence}:${card.answer}`) % 2 === 1) choices.reverse();
  return choices;
}
