"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import {
  fillBlankChoiceOptions,
  isAcceptedFillBlankAnswer,
} from "@/lib/quiz-presentation";
import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";

type QuizCardType = Extract<Card, { type: "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }>;
type QuizVariant = "card" | "interlude";
type AnswerChoice = number | boolean | string;

export default function QuizCard({
  card,
  onAnswered,
  variant = "card",
  answerResult,
}: {
  card: QuizCardType;
  onAnswered: (result: QuizAnswerResult) => void;
  variant?: QuizVariant;
  answerResult?: QuizAnswerResult;
}) {
  const immersive = variant === "interlude";
  const feedbackId = useId();
  const startedAt = useRef(Date.now());
  const submitted = useRef(Boolean(answerResult));
  const submittedHere = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const fillBlankOptions = useMemo<readonly string[]>(
    () => card.type === "quiz_fillblank" ? fillBlankChoiceOptions(card) : [],
    [card]
  );
  const initialChoice = answerResult && card.type === "quiz_fillblank" && answerResult.answer === null && answerResult.hintCount > 0
    ? fillBlankOptions.find((option) => !isAcceptedFillBlankAnswer(card, option)) ?? null
    : answerResult?.answer ?? null;
  const [choice, setChoice] = useState<AnswerChoice | null>(initialChoice);
  const [draftChoice, setDraftChoice] = useState<AnswerChoice | null>(initialChoice);
  const [revealed, setRevealed] = useState(Boolean(answerResult));
  const [correct, setCorrect] = useState(Boolean(answerResult?.correct));

  const submit = useCallback((answer: AnswerChoice) => {
    if (submitted.current || revealed) return;
    submitted.current = true;
    submittedHere.current = true;
    let accepted = false;
    let recordedAnswer: QuizAnswerResult["answer"] = answer;
    let hintCount = 0;
    if (card.type === "quiz_mcq" && typeof answer === "number") {
      accepted = answer === card.correct_index;
      setChoice(answer);
    } else if (card.type === "quiz_truefalse" && typeof answer === "boolean") {
      accepted = answer === card.answer;
      setChoice(answer);
    } else if (card.type === "quiz_fillblank" && typeof answer === "string") {
      accepted = isAcceptedFillBlankAnswer(card, answer);
      if (!accepted) {
        recordedAnswer = null;
        hintCount = 1;
      }
      setChoice(answer);
    }
    setCorrect(accepted);
    setRevealed(true);
    const fallbackId = `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    onAnswered({
      eventId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackId,
      answer: recordedAnswer,
      correct: accepted,
      responseTimeMs: Math.max(0, Date.now() - startedAt.current),
      occurredAt: new Date().toISOString(),
      attemptNumber: 1,
      hintCount,
    });
  }, [card, onAnswered, revealed]);

  useEffect(() => {
    const restoredChoice = answerResult && card.type === "quiz_fillblank" && answerResult.answer === null && answerResult.hintCount > 0
      ? fillBlankOptions.find((option) => !isAcceptedFillBlankAnswer(card, option)) ?? null
      : answerResult?.answer ?? null;
    submitted.current = Boolean(answerResult);
    if (!answerResult) submittedHere.current = false;
    startedAt.current = Date.now();
    setChoice(restoredChoice);
    setDraftChoice(restoredChoice);
    setCorrect(Boolean(answerResult?.correct));
    setRevealed(Boolean(answerResult));
  }, [card, answerResult, fillBlankOptions]);

  useEffect(() => {
    if (!revealed || !submittedHere.current) return;
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }, [revealed]);

  useEffect(() => {
    if (!immersive || revealed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      if (event.key === "Enter" && draftChoice !== null) {
        event.preventDefault();
        submit(draftChoice);
      } else if (card.type === "quiz_mcq") {
        const optionIndex = Number(event.key) - 1;
        if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < card.options.length) {
          event.preventDefault();
          setDraftChoice(optionIndex);
        }
      } else if (card.type === "quiz_truefalse") {
        if (event.key.toLowerCase() === "t") { event.preventDefault(); setDraftChoice(true); }
        if (event.key.toLowerCase() === "f") { event.preventDefault(); setDraftChoice(false); }
      } else {
        const optionIndex = Number(event.key) - 1;
        if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < fillBlankOptions.length) {
          event.preventDefault();
          submit(fillBlankOptions[optionIndex]);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [card, draftChoice, fillBlankOptions, immersive, revealed, submit]);

  const questionClass = immersive
    ? "lesson-quiz-question display mt-4 text-[clamp(2.25rem,6vw,4.25rem)] leading-[0.94]"
    : "lesson-quiz-question display mt-3 text-[clamp(1.8rem,5vw,2.75rem)] leading-[0.98]";
  const optionClass = immersive
    ? "min-h-[4.75rem] rounded-2xl px-4 py-4 text-base"
    : "min-h-12 rounded-xl px-3.5 py-3 text-sm";
  const choose = (answer: AnswerChoice) => {
    if (revealed) return;
    if (immersive && card.type !== "quiz_fillblank") setDraftChoice(answer);
    else submit(answer);
  };
  const usedClue = card.type === "quiz_fillblank" && typeof choice === "string" && !isAcceptedFillBlankAnswer(card, choice);

  return (
    <article className={`lesson-quiz overflow-hidden border border-dusk/25 bg-card ${immersive ? "lesson-quiz-interlude" : ""}`} data-revealed={revealed} data-correct={revealed ? correct : undefined}>
      <header className={`lesson-quiz-header border-b border-line bg-dusk text-white ${immersive ? "px-6 py-7 sm:px-9 sm:py-9" : "px-5 py-5 sm:px-6"}`}>
        <div className="lesson-quiz-label flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/75"><AppIcon name={immersive ? "spark" : "compass"} className="h-4 w-4" />{immersive ? "Quick choice" : "Decision moment"}</div>
        {card.type === "quiz_mcq" && <h2 className={questionClass}>{card.question}</h2>}
        {card.type === "quiz_truefalse" && <><p className="mt-4 text-xs font-bold uppercase tracking-[0.13em] text-white/70">True or false?</p><h2 className={questionClass}>{card.statement}</h2></>}
        {card.type === "quiz_fillblank" && <h2 className={questionClass}>Which idea completes the sentence?</h2>}
      </header>

      <div className={`lesson-quiz-body text-ink ${immersive ? "p-6 sm:p-9" : "p-5 sm:p-6"}`}>
        {card.type === "quiz_mcq" && <div className={`quiz-options grid gap-3 ${immersive ? "md:grid-cols-2" : "sm:grid-cols-2"}`} role={immersive ? "radiogroup" : "group"} aria-label="Answer choices" aria-describedby={revealed ? feedbackId : undefined}>{card.options.map((option, index) => {
          const isCorrect = revealed && index === card.correct_index;
          const isChosenWrong = revealed && index === choice && index !== card.correct_index;
          const state = isCorrect ? "correct" : isChosenWrong ? "wrong" : draftChoice === index ? "selected" : "idle";
          return <button key={`${index}-${option}`} type="button" onClick={() => choose(index)} disabled={!immersive && revealed} aria-disabled={revealed} role={immersive ? "radio" : undefined} aria-checked={immersive ? draftChoice === index : undefined} aria-pressed={!immersive ? choice === index : undefined} data-state={state} className={`quiz-option flex w-full items-center gap-3 border text-left font-medium transition-all ${optionClass} ${isCorrect ? "border-go bg-go-soft text-go-deep" : isChosenWrong ? "border-no bg-no-soft text-no-deep" : "border-line-deep bg-ivory hover:-translate-y-0.5 hover:border-dusk/45 hover:shadow-card"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${isCorrect ? "bg-go text-white" : isChosenWrong ? "bg-no text-white" : draftChoice === index && immersive ? "bg-teal text-white" : "bg-paper text-ink-soft"}`}>{isCorrect ? <AppIcon name="check" className="h-4 w-4" /> : String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1">{option}</span>{immersive && !revealed && <kbd className="rounded-md border border-line bg-paper px-2 py-1 text-[10px] font-bold text-ink-soft">{index + 1}</kbd>}{isCorrect && <span className="text-xs font-bold uppercase tracking-wide text-go-deep">Correct</span>}{isChosenWrong && <span className="text-xs font-bold uppercase tracking-wide text-no-deep">Yours</span>}</button>;
        })}</div>}

        {card.type === "quiz_truefalse" && <div className="grid gap-3 sm:grid-cols-2" role={immersive ? "radiogroup" : "group"} aria-label="Choose true or false" aria-describedby={revealed ? feedbackId : undefined}>{[true, false].map((value) => {
          const isCorrect = revealed && value === card.answer;
          const isChosenWrong = revealed && value === choice && value !== card.answer;
          return <button key={String(value)} type="button" onClick={() => choose(value)} disabled={!immersive && revealed} aria-disabled={revealed} role={immersive ? "radio" : undefined} aria-checked={immersive ? draftChoice === value : undefined} aria-pressed={!immersive ? choice === value : undefined} data-state={isCorrect ? "correct" : isChosenWrong ? "wrong" : draftChoice === value ? "selected" : "idle"} className={`quiz-option rounded-2xl border px-4 font-semibold transition-all ${immersive ? "min-h-28 text-xl" : "min-h-20 text-base"} ${isCorrect ? "border-go bg-go-soft text-go-deep" : isChosenWrong ? "border-no bg-no-soft text-no-deep" : "border-line-deep bg-ivory hover:-translate-y-0.5 hover:border-dusk/45 hover:shadow-card"}`}>{isCorrect && <AppIcon name="check" className="mx-auto mb-2 h-5 w-5" />}{value ? "True" : "False"}{immersive && !revealed && <kbd className="ml-3 rounded-md border border-line bg-paper px-2 py-1 text-[10px] font-bold text-ink-soft">{value ? "T" : "F"}</kbd>}{isChosenWrong && <span className="mt-1 block text-xs uppercase tracking-wide">Your answer</span>}</button>;
        })}</div>}

        {card.type === "quiz_fillblank" && <>
          <p className={`reading rounded-2xl border border-line bg-ivory ${immersive ? "p-6 text-lg sm:p-8" : "p-5"}`}>{card.sentence.split("___").map((part, index, parts) => <span key={index}>{part}{index < parts.length - 1 && <span className="mx-1 inline-block min-w-28 border-b-2 border-teal px-1 text-center font-semibold text-teal-deep">{revealed ? card.answer : "choose below"}</span>}</span>)}</p>
          <div className={`quiz-options mt-5 grid gap-3 ${immersive ? "md:grid-cols-2" : "sm:grid-cols-2"}`} role="group" aria-label="Choose the missing idea or reveal a clue" aria-describedby={revealed ? feedbackId : undefined}>{fillBlankOptions.map((option, index) => {
            const optionIsCorrect = isAcceptedFillBlankAnswer(card, option);
            const isCorrect = revealed && optionIsCorrect;
            const isChosenClue = revealed && choice === option && !optionIsCorrect;
            const state = isCorrect ? "correct" : isChosenClue ? "hint" : draftChoice === option ? "selected" : "idle";
            return <button key={`${index}-${option}`} type="button" onClick={() => choose(option)} disabled={!immersive && revealed} aria-disabled={revealed} aria-pressed={choice === option} data-state={state} className={`quiz-option flex w-full items-center gap-3 border text-left font-medium transition-all ${optionClass} ${isCorrect ? "border-go bg-go-soft text-go-deep" : isChosenClue ? "border-teal bg-sky text-teal-deep" : "border-line-deep bg-ivory hover:-translate-y-0.5 hover:border-dusk/45 hover:shadow-card"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${isCorrect ? "bg-go text-white" : isChosenClue ? "bg-teal text-white" : draftChoice === option && immersive ? "bg-teal text-white" : "bg-paper text-ink-soft"}`}>{isCorrect ? <AppIcon name="check" className="h-4 w-4" /> : isChosenClue ? <AppIcon name="spark" className="h-4 w-4" /> : String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1">{option}</span>{immersive && !revealed && <kbd className="rounded-md border border-line bg-paper px-2 py-1 text-[10px] font-bold text-ink-soft">{index + 1}</kbd>}{isCorrect && <span className="text-xs font-bold uppercase tracking-wide text-go-deep">Correct</span>}{isChosenClue && <span className="text-xs font-bold uppercase tracking-wide text-teal-deep">Clue used</span>}</button>;
          })}</div>
        </>}

        {immersive && !revealed && card.type !== "quiz_fillblank" && <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-2xl border border-line bg-paper/60 p-3 sm:flex-row"><p className="px-2 text-xs leading-5 text-ink-soft">Choose one answer. Lock it in when you are ready.</p><button type="button" onClick={() => { if (draftChoice !== null) submit(draftChoice); }} disabled={draftChoice === null} className="btn-primary min-w-40"><AppIcon name="lock" className="h-4 w-4" />Lock answer</button></div>}

        {revealed && <div ref={feedbackRef} tabIndex={-1} id={feedbackId} role="status" className={`quiz-feedback mt-5 rounded-2xl border px-5 py-5 ${correct ? "course-feedback-success" : usedClue ? "border-teal/35 bg-sky text-ink" : "course-feedback-error"}`} data-result={correct ? "correct" : usedClue ? "hint" : "incorrect"}><div className="flex items-center gap-2 font-semibold"><AppIcon name={correct ? "check" : usedClue ? "spark" : "compass"} className="h-4 w-4" />{correct ? "Path opened." : usedClue ? "Clue revealed." : "Correction collected."}</div><p className="mt-2 text-sm leading-6 opacity-80">{card.explanation}</p>{immersive && <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] opacity-65">{correct ? "You recalled it without the source in view." : usedClue ? "No mastery penalty. Carry the idea forward." : "Carry the corrected idea into the next moment."}</p>}</div>}
      </div>
    </article>
  );
}
