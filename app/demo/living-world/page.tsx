"use client";

import { useState } from "react";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseOverviewHero from "@/components/CourseOverviewHero";
import JourneyMap, { type JourneyModule } from "@/components/JourneyMap";
import LessonBlock from "@/components/LessonBlock";
import { COURSE_THEME_PRESETS } from "@/lib/course-themes";
import type { Card } from "@/lib/schemas";

const modules: JourneyModule[] = [
  { id: 1, title: "Read the signal", summary: "Notice what changes before pressure becomes obvious.", status: "ready", lessons: [
    { id: 101, title: "The architecture of influence", cardCount: 7, completed: false },
    { id: 102, title: "When options begin to shrink", cardCount: 6, completed: false },
    { id: 103, title: "The pause that restores choice", cardCount: 8, completed: false },
  ] },
  { id: 2, title: "Test the pattern", summary: "Separate ordinary persuasion from pressure and coercion.", status: "ready", lessons: [
    { id: 201, title: "Reciprocity and hidden debt", cardCount: 7, completed: false },
    { id: 202, title: "Manufactured urgency", cardCount: 6, completed: false },
  ] },
  { id: 3, title: "Build your defence", summary: "Practise boundaries that protect time and agency.", status: "ready", lessons: [
    { id: 301, title: "Name the pressure", cardCount: 5, completed: false },
    { id: 302, title: "Create a clean exit", cardCount: 7, completed: false },
  ] },
];

const cards: Card[] = [
  { type: "concept", title: "Influence hides in shrinking options", body: "Healthy persuasion leaves room for questions, time, and a genuine no. Pressure quietly removes those choices until one outcome feels inevitable." },
  { type: "example", title: "Listen for the rush", body: "A request becomes pressure when delay is framed as disloyalty or a normal question is treated as mistrust." },
  { type: "recap", title: "Three signals to keep", points: ["Time suddenly contracts", "Questions become disloyal", "One option dominates"] },
  { type: "quiz_truefalse", statement: "Healthy persuasion leaves room for a genuine no.", answer: true, explanation: "Space to decline is one of the clearest differences between persuasion and coercive pressure." },
];

export default function LivingWorldDemoPage() {
  const [presetIndex, setPresetIndex] = useState(0);
  const theme = COURSE_THEME_PRESETS[presetIndex];
  return (
    <CourseAppearanceFrame appearance={theme.appearance} className="course-page-bg min-h-dvh">
      <main className="mx-auto w-full max-w-[86rem] px-3 py-5 sm:px-6 sm:py-8">
        <nav className="theme-preset-strip mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Theme presets">
          {COURSE_THEME_PRESETS.map((preset, index) => <button key={preset.id} type="button" onClick={() => setPresetIndex(index)} aria-pressed={index === presetIndex} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold ${index === presetIndex ? "border-[var(--course-accent)] bg-[var(--course-primary)] text-[var(--course-on-primary)]" : "border-line bg-card text-ink-soft"}`}>{preset.name}</button>)}
        </nav>
        <CourseOverviewHero courseId={`preview:${theme.id}`} title="The Architecture of Influence" description="Recognise manipulative pressure, protect your thinking time, and respond without surrendering your agency." appearance={theme.appearance} progress={32} completedLessons={3} totalLessons={9} moduleCount={3} sourceHref={null} />

        <section id="course-journey" className="pt-16">
          <p className="section-label">Course atlas</p>
          <h2 className="display mt-2 text-5xl">One product, six distinct worlds.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">The navigation stays stable while palette, pattern, cards, icons, controls, and locked states adapt to the subject.</p>
          <div className="mt-7"><JourneyMap modules={modules} courseId="living-world-preview" courseTitle="The Architecture of Influence" appearance={theme.appearance} /></div>
        </section>

        <section className="pt-16">
          <div className="mb-5 flex items-end justify-between gap-4"><div><p className="section-label">Lesson moment</p><h2 className="display mt-2 text-4xl">Editorial blocks, not a card conveyor belt.</h2></div><span className="hidden rounded-full border border-line bg-card px-3 py-2 text-xs text-ink-soft sm:block">4 semantic treatments</span></div>
          <div className="lesson-moment-grid">{cards.map((card, index) => <LessonBlock key={index} card={card} cardIndex={index} onAnswered={() => undefined} />)}</div>
        </section>
      </main>
    </CourseAppearanceFrame>
  );
}
