"use client";

import { useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";

type QuizCardType = Extract<Card, { type: "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }>;

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[.,!?'“”"]/g, "");
}

export default function QuizCard({ card, onAnswered }: { card: QuizCardType; onAnswered: (result: QuizAnswerResult) => void }) {
  const [startedAt] = useState(() => Date.now());
  const submitted = useRef(false);
  const [choice, setChoice] = useState<number | boolean | null>(null);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(false);

  function submit(answer: number | boolean | string) {
    if (submitted.current || revealed) return;
    submitted.current = true;
    let accepted = false;
    if (card.type === "quiz_mcq" && typeof answer === "number") {
      accepted = answer === card.correct_index;
      setChoice(answer);
    } else if (card.type === "quiz_truefalse" && typeof answer === "boolean") {
      accepted = answer === card.answer;
      setChoice(answer);
    } else if (card.type === "quiz_fillblank" && typeof answer === "string") {
      accepted = [card.answer, ...card.accepted_answers].map(normalize).includes(normalize(answer));
    }
    setCorrect(accepted);
    setRevealed(true);
    const fallbackId = `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    onAnswered({
      eventId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackId,
      answer,
      correct: accepted,
      responseTimeMs: Math.max(0, Date.now() - startedAt),
      occurredAt: new Date().toISOString(),
      attemptNumber: 1,
      hintCount: 0,
    });
  }

  return (
    <article className="overflow-hidden rounded-[1.6rem] border border-dusk/25 bg-card shadow-card">
      <header className="border-b border-line bg-dusk px-6 py-6 text-white sm:px-9">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-white/70"><AppIcon name="compass" className="h-4 w-4" />Decision moment</div>
        {card.type === "quiz_mcq" && <h2 className="display mt-4 text-[clamp(2.2rem,8vw,3.7rem)] leading-[0.96]">{card.question}</h2>}
        {card.type === "quiz_truefalse" && <><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">True or false?</p><h2 className="display mt-2 text-[clamp(2.1rem,8vw,3.5rem)] leading-[0.98]">{card.statement}</h2></>}
        {card.type === "quiz_fillblank" && <h2 className="display mt-4 text-[clamp(2.2rem,8vw,3.7rem)] leading-[0.96]">Complete the thought</h2>}
      </header>

      <div className="p-5 sm:p-8">
        {card.type === "quiz_mcq" && <div className="space-y-3" role="group" aria-label="Answer choices">{card.options.map((option, index) => {
          const isCorrect = revealed && index === card.correct_index;
          const isChosenWrong = revealed && index === choice && index !== card.correct_index;
          return <button key={option} type="button" onClick={() => submit(index)} disabled={revealed} aria-pressed={choice === index} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${isCorrect ? "border-go bg-go-soft" : isChosenWrong ? "border-no bg-no-soft" : "border-line-deep bg-ivory hover:border-dusk/45"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${isCorrect ? "bg-go text-white" : isChosenWrong ? "bg-no text-white" : "bg-paper text-ink-soft"}`}>{isCorrect ? <AppIcon name="check" className="h-4 w-4" /> : String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1">{option}</span>{isCorrect && <span className="text-[10px] font-bold uppercase tracking-wide text-go">Correct answer</span>}{isChosenWrong && <span className="text-[10px] font-bold uppercase tracking-wide text-no">Your answer</span>}</button>;
        })}</div>}

        {card.type === "quiz_truefalse" && <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Choose true or false">{[true, false].map((value) => {
          const isCorrect = revealed && value === card.answer;
          const isChosenWrong = revealed && value === choice && value !== card.answer;
          return <button key={String(value)} type="button" onClick={() => submit(value)} disabled={revealed} aria-pressed={choice === value} className={`min-h-20 rounded-xl border px-4 py-4 text-base font-semibold transition-colors ${isCorrect ? "border-go bg-go-soft text-go-deep" : isChosenWrong ? "border-no bg-no-soft text-no" : "border-line-deep bg-ivory hover:border-dusk/45"}`}>{isCorrect && <AppIcon name="check" className="mx-auto mb-2 h-4 w-4" />}{value ? "True" : "False"}{isChosenWrong && <span className="mt-1 block text-[10px] uppercase tracking-wide">Your answer</span>}</button>;
        })}</div>}

        {card.type === "quiz_fillblank" && <><p className="reading rounded-xl border border-line bg-ivory p-5">{card.sentence.split("___").map((part, index, parts) => <span key={index}>{part}{index < parts.length - 1 && <span className="mx-1 inline-block min-w-24 border-b-2 border-teal px-1 text-center font-semibold text-teal-deep">{revealed ? card.answer : typed || " "}</span>}</span>)}</p>{!revealed && <form onSubmit={(event) => { event.preventDefault(); if (typed.trim()) submit(typed); }} className="mt-5 flex flex-col gap-3 sm:flex-row"><label htmlFor="fill-answer" className="screen-reader-text">Your answer</label><input id="fill-answer" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type your answer" autoFocus className="field min-w-0 flex-1" /><button type="submit" disabled={!typed.trim()} className="btn-primary sm:shrink-0">Check answer</button></form>}</>}

        {revealed && <div role="status" className={`mt-5 rounded-xl border px-5 py-4 ${correct ? "border-go/30 bg-go-soft" : "border-no/30 bg-no-soft"}`}><div className="flex items-center gap-2 font-semibold"><AppIcon name={correct ? "check" : "compass"} className="h-4 w-4" />{correct ? "That’s right." : "Take another look."}</div><p className="mt-2 text-sm leading-6 text-ink-soft">{card.explanation}</p></div>}
      </div>
    </article>
  );
}
