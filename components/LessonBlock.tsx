import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";
import type { QuizCard as QuizCardType } from "@/lib/learning-types";
import QuizCard from "@/components/QuizCard";
import ReadingCanvas from "@/components/ReadingCanvas";
import RichBlockCard, { type RichCard } from "@/components/RichBlockCard";
import { lessonBlockMeta } from "@/lib/lesson-layout";

function isQuizCard(card: Card): card is QuizCardType {
  return card.type === "quiz_mcq" || card.type === "quiz_truefalse" || card.type === "quiz_fillblank";
}

export default function LessonBlock({
  card,
  cardIndex = 0,
  onAnswered,
}: {
  card: Card;
  cardIndex?: number;
  onAnswered: (result: QuizAnswerResult) => void;
}) {
  const meta = lessonBlockMeta(card, cardIndex);
  let content;

  if (card.type === "concept") {
    content = <ReadingCanvas variant={meta.kind === "idea" ? "editorial" : "insight"} label={meta.label} title={card.title} icon={meta.kind === "idea" ? "bookmark" : "spark"}><p className="reading whitespace-pre-wrap text-ink">{card.body}</p></ReadingCanvas>;
  } else if (card.type === "example") {
    content = <ReadingCanvas variant="notebook" label={meta.label} title={card.title} icon="source"><p className="reading whitespace-pre-wrap text-ink">{card.body}</p></ReadingCanvas>;
  } else if (card.type === "recap") {
    content = <ReadingCanvas variant="journal" label={meta.label} title={card.title} icon="trail"><ul className="lesson-summary-list">{card.points.map((point, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></li>)}</ul></ReadingCanvas>;
  } else if (isQuizCard(card)) {
    content = <QuizCard card={card} onAnswered={onAnswered} />;
  } else {
    content = <RichBlockCard card={card as RichCard} />;
  }

  return <div className="lesson-block" data-block-kind={meta.kind} data-block-size={meta.size}>{content}</div>;
}
