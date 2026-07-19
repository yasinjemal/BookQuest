import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-sidebar p-3 sm:p-5" aria-labelledby="auth-page-title">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-paper shadow-pop sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[.9fr_1.1fr]">
        <aside className="premium-panel relative m-3 hidden rounded-[1.5rem] p-10 lg:flex lg:flex-col lg:justify-between">
          <Link href="/" className="relative z-10 flex min-h-11 items-center gap-3 font-semibold text-white"><span className="brand-mark text-white" aria-hidden="true" />BookQuest</Link>
          <div className="relative z-10">
            <span className="eyebrow text-signal">Learning, with proof</span>
            <p className="display mt-7 text-[clamp(3.25rem,5vw,4.5rem)] leading-[0.9] text-white">Make useful knowledge <em className="text-signal">last.</em></p>
            <p className="mt-6 max-w-sm text-sm leading-6 text-white/75">A beautifully clear home for trusted training, deliberate learning, and evidence that holds up.</p>
          </div>
          <p className="relative z-10 text-xs font-bold uppercase tracking-[0.18em] text-white/70">BookQuest · South Africa</p>
        </aside>

        <section className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-12 sm:px-10 lg:py-16">
          <Link href="/" className="mb-10 flex min-h-11 items-center gap-3 font-semibold lg:hidden"><span className="brand-mark text-ink" aria-hidden="true" />BookQuest</Link>
          <p className="section-label mb-4">{eyebrow}</p>
          <h1 id="auth-page-title" className="display text-[clamp(2.75rem,12vw,3.75rem)] leading-[0.95]">{title}</h1>
          <p className="mt-4 text-sm leading-6 text-ink-soft">{description}</p>
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </main>
  );
}
