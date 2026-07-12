"use client";

import { useRef, useState } from "react";
import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";

type QuizCardType = Extract<
  Card,
  { type: "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }
>;

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[.,!?'"]/g, "");
}

export default function QuizCard({
  card,
  onAnswered,
}: {
  card: QuizCardType;
  onAnswered: (result: QuizAnswerResult) => void;
}) {
  const [startedAt] = useState(() => Date.now());
  const submitted = useRef(false);
  const [choice, setChoice] = useState<number | boolean | null>(null);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(false);

  function submit(answer: number | boolean | string) {
    if (submitted.current || revealed) return;
    submitted.current = true;
    let ok = false;
    if (card.type === "quiz_mcq" && typeof answer === "number") {
      ok = answer === card.correct_index;
      setChoice(answer);
    } else if (card.type === "quiz_truefalse" && typeof answer === "boolean") {
      ok = answer === card.answer;
      setChoice(answer);
    } else if (card.type === "quiz_fillblank" && typeof answer === "string") {
      const accepted = [card.answer, ...card.accepted_answers].map(normalize);
      ok = accepted.includes(normalize(answer));
    }
    setCorrect(ok);
    setRevealed(true);
    const fallbackId = `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    onAnswered({
      eventId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : fallbackId,
      answer,
      correct: ok,
      responseTimeMs: Math.max(0, Date.now() - startedAt),
      occurredAt: new Date().toISOString(),
      attemptNumber: 1,
      hintCount: 0,
    });
  }

  return (
    <div>
      <span className="inline-block text-xs font-bold uppercase tracking-wide rounded-full px-2.5 py-1 bg-primary/10 text-primary-deep">
        Quiz
      </span>

      {card.type === "quiz_mcq" && (
        <>
          <h2 className="text-lg font-extrabold mt-3">{card.question}</h2>
          <div className="mt-4 space-y-2.5">
            {card.options.map((opt, i) => {
              let style =
                "border-line bg-card hover:border-primary/50";
              if (revealed) {
                if (i === card.correct_index)
                  style = "border-go bg-go-soft";
                else if (i === choice) style = "border-no bg-no-soft";
                else style = "border-line bg-card opacity-60";
              }
              return (
                <button
                  key={i}
                  onClick={() => submit(i)}
                  disabled={revealed}
                  className={`w-full text-left rounded-xl border-2 px-4 py-3 font-medium transition active:scale-[0.99] ${style}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}

      {card.type === "quiz_truefalse" && (
        <>
          <h2 className="text-lg font-extrabold mt-3">True or false?</h2>
          <p className="text-[17px] leading-relaxed mt-3">{card.statement}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[true, false].map((val) => {
              let style = "border-line bg-card hover:border-primary/50";
              if (revealed) {
                if (val === card.answer) style = "border-go bg-go-soft";
                else if (val === choice) style = "border-no bg-no-soft";
                else style = "border-line bg-card opacity-60";
              }
              return (
                <button
                  key={String(val)}
                  onClick={() => submit(val)}
                  disabled={revealed}
                  className={`rounded-xl border-2 py-3.5 font-bold transition active:scale-[0.98] ${style}`}
                >
                  {val ? "TRUE" : "FALSE"}
                </button>
              );
            })}
          </div>
        </>
      )}

      {card.type === "quiz_fillblank" && (
        <>
          <h2 className="text-lg font-extrabold mt-3">Fill in the blank</h2>
          <p className="text-[17px] leading-relaxed mt-3">
            {card.sentence.split("___").map((part, i, arr) => (
              <span key={i}>
                {part}
                {i < arr.length - 1 && (
                  <span className="inline-block min-w-20 border-b-2 border-primary text-center font-bold text-primary-deep px-1">
                    {revealed ? card.answer : typed || " "}
                  </span>
                )}
              </span>
            ))}
          </p>
          {!revealed && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) submit(typed);
              }}
              className="mt-5 flex gap-2"
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your answer"
                autoFocus
                className="flex-1 rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!typed.trim()}
                className="rounded-xl bg-primary text-white font-bold px-4 disabled:opacity-40"
              >
                Check
              </button>
            </form>
          )}
        </>
      )}

      {revealed && (
        <div
          className={`mt-5 rounded-xl px-4 py-3 slide-up ${
            correct ? "bg-go-soft text-green-900" : "bg-no-soft text-red-900"
          }`}
        >
          <div className="font-extrabold">
            {correct ? "✓ Correct!" : "✗ Not quite"}
          </div>
          <p className="text-sm mt-1">{card.explanation}</p>
        </div>
      )}
    </div>
  );
}
