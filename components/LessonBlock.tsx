import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";
import type { QuizCard as QuizCardType } from "@/lib/learning-types";
import QuizCard from "@/components/QuizCard";
import ReadingCanvas from "@/components/ReadingCanvas";
import RichBlockCard, { type RichCard } from "@/components/RichBlockCard";

function isQuizCard(card: Card): card is QuizCardType {
  return card.type === "quiz_mcq" || card.type === "quiz_truefalse" || card.type === "quiz_fillblank";
}

export default function LessonBlock({
  card,
  onAnswered,
}: {
  card: Card;
  onAnswered: (result: QuizAnswerResult) => void;
}) {
  if (card.type === "concept") return <ReadingCanvas variant="editorial" label="Key idea" title={card.title} icon="bookmark"><p className="reading whitespace-pre-wrap text-ink">{card.body}</p></ReadingCanvas>;
  if (card.type === "example") return <ReadingCanvas variant="notebook" label="Worked example" title={card.title} icon="source"><p className="reading whitespace-pre-wrap text-ink">{card.body}</p></ReadingCanvas>;
  if (card.type === "recap") return <ReadingCanvas variant="journal" label="Journey journal" title={card.title} icon="trail"><ul className="space-y-4">{card.points.map((point, index) => <li key={index} className="reading flex gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-forest text-xs font-bold text-white">{index + 1}</span><span>{point}</span></li>)}</ul></ReadingCanvas>;
  if (isQuizCard(card)) return <QuizCard card={card} onAnswered={onAnswered} />;
  return <RichBlockCard card={card as RichCard} />;
}
