"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Loading from "@/components/Loading";

interface CourseSummary {
  id: number;
  title: string;
  description: string;
  source_filename: string;
  status: string;
  error: string | null;
  published: number;
  totalLessons: number;
  doneLessons: number;
}
interface Me {
  id: number;
  name: string;
  role: string;
  credits: number;
  premium_until: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  extracting: "Reading your document…",
  outlining: "Designing the course…",
  generating: "Writing lessons & quizzes…",
  error: "Something went wrong",
};

function CourseCard({
  c,
  onRetry,
}: {
  c: CourseSummary;
  onRetry?: () => void;
}) {
  const busy = ["extracting", "outlining", "generating"].includes(c.status);
  const pct =
    c.totalLessons > 0 ? Math.round((c.doneLessons / c.totalLessons) * 100) : 0;
  return (
    <Link
      href={`/course/${c.id}`}
      className="group block rounded-2xl border border-line bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-line-deep hover:shadow-pop sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink font-display text-xl text-signal">{c.title.charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold tracking-[-0.015em]">{c.title}</h2>
            <p className="mt-0.5 truncate text-xs text-ink-soft">{c.description || c.source_filename}</p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {!!c.published && (
            <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-teal">
              Published
            </span>
          )}
          {c.status === "ready" && (
            <span className="rounded-full bg-go-soft px-2.5 py-1 text-[10px] font-bold text-go">
              {pct}%
            </span>
          )}
        </div>
      </div>
      {busy && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary-deep">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          {STATUS_LABEL[c.status]}
          {c.totalLessons > 0 && ` (${c.totalLessons} lessons so far)`}
        </div>
      )}
      {c.status === "error" && (
        <div className="mt-2">
          <p className="text-xs text-no">{c.error ?? STATUS_LABEL.error}</p>
          {onRetry && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onRetry();
              }}
              className="mt-2 text-xs font-bold text-primary-deep border border-primary/40 rounded-lg px-3 py-1.5 active:scale-95 transition cursor-pointer"
            >
              ↻ Retry
            </button>
          )}
        </div>
      )}
      {c.status === "ready" && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-go transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </Link>
  );
}

export default function HomePage() {
  const [me, setMe] = useState<Me | null | "anon">(null);
  const [owned, setOwned] = useState<CourseSummary[]>([]);
  const [enrolled, setEnrolled] = useState<CourseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generateWithAi, setGenerateWithAi] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const meRes = await fetch("/api/me");
      if (meRes.status === 401) {
        setMe("anon");
        return;
      }
      if (!meRes.ok) {
        // The server is reachable but erroring (e.g. 500). Surface it instead of
        // hanging on "Loading…" forever with me stuck at null.
        setFailed(true);
        return;
      }
      const meData = await meRes.json();
      setMe(meData.user);
      const res = await fetch("/api/courses");
      if (res.ok) {
        const data = await res.json();
        setOwned(data.owned);
        setEnrolled(data.enrolled);
      }
    } catch {
      // Network failure. If we have never loaded, show the error state; an
      // offline reload with cached SW data keeps whatever already rendered.
      if (!hasLoadedRef.current) setFailed(true);
    } finally {
      hasLoadedRef.current = true;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!owned.some((c) => ["extracting", "outlining", "generating"].includes(c.status)))
      return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [owned, load]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("generate", String(generateWithAi));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setUploadError(data.error ?? "Upload failed");
      else if (data.studioUrl) window.location.href = data.studioUrl;
      await load();
    } catch {
      setUploadError("Upload failed — are you online?");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (me === "anon") return <div className="min-h-dvh overflow-hidden bg-paper">
    <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-[-0.02em]"><span className="brand-mark text-ink" aria-hidden="true" /><span>BookQuest</span></Link>
      <div className="flex items-center gap-2 sm:gap-3"><Link href="/verify-credential" className="hidden text-sm font-semibold text-ink-soft transition-colors hover:text-ink sm:block">Verify credential</Link><Link href="/login" className="quiet-button">Sign in</Link></div>
    </header>

    <main className="px-3 pb-20 sm:px-6">
      <section className="premium-panel mx-auto grid max-w-7xl items-center gap-14 px-6 py-14 sm:px-10 sm:py-16 lg:min-h-[720px] lg:grid-cols-[1.02fr_.98fr] lg:px-16 lg:py-20">
        <div className="relative z-10">
          <span className="eyebrow text-signal">Documents in. Capability out.</span>
          <h1 className="display mt-8 max-w-3xl text-[4.25rem] leading-[0.88] text-white sm:text-[5.8rem] lg:text-[6.7rem]">Knowledge, beautifully made <em className="text-signal">useful.</em></h1>
          <p className="mt-8 max-w-xl text-base leading-7 text-white/58 sm:text-lg sm:leading-8">BookQuest turns the documents your organization trusts into courses people can finish—and evidence you can stand behind.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex items-center justify-center gap-3 rounded-full bg-signal px-6 py-3.5 text-sm font-bold text-ink transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(220,250,114,.22)]">Create your first course <span aria-hidden="true">↗</span></Link><Link href="/verify-credential" className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10">Verify evidence</Link></div>
          <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/35"><span>Editable by design</span><span>Works offline</span><span>Evidence linked</span></div>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[520px] py-10 lg:py-0">
          <div className="absolute left-4 top-0 h-28 w-28 rounded-full bg-coral blur-[70px]" />
          <div className="paper-card rotate-[-2deg] p-5 text-ink sm:p-7">
            <div className="flex items-start justify-between gap-5 border-b border-line pb-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Live course</p><h2 className="display mt-2 text-3xl sm:text-4xl">Employee onboarding</h2><p className="mt-1 text-xs text-ink-soft">Blacksteel Clothing · Version 1.0</p></div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-go-soft text-go">✓</span>
            </div>
            <div className="space-y-3 py-5">
              {[{ n: "01", t: "Welcome to the floor", c: "4 min" }, { n: "02", t: "Opening the shop", c: "6 min" }, { n: "03", t: "Customer and stock care", c: "8 min" }].map((lesson, index) => <div key={lesson.n} className={`flex items-center gap-4 rounded-xl p-3 ${index === 0 ? "bg-ink text-white" : "border border-line bg-paper/60"}`}><span className={`text-[10px] font-bold ${index === 0 ? "text-signal" : "text-ink-soft"}`}>{lesson.n}</span><span className="min-w-0 flex-1 text-sm font-semibold">{lesson.t}</span><span className={`text-[10px] ${index === 0 ? "text-white/45" : "text-ink-soft"}`}>{lesson.c}</span></div>)}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-line pt-5 text-center"><div><strong className="display block text-2xl">3</strong><span className="text-[9px] uppercase tracking-wider text-ink-soft">Learners</span></div><div><strong className="display block text-2xl">100%</strong><span className="text-[9px] uppercase tracking-wider text-ink-soft">Evidence</span></div><div><strong className="display block text-2xl">1</strong><span className="text-[9px] uppercase tracking-wider text-ink-soft">Source</span></div></div>
          </div>
          <div className="absolute -bottom-2 -left-3 rotate-[4deg] rounded-2xl bg-primary px-5 py-4 text-white shadow-pop sm:-left-10"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Audit pack</p><p className="mt-1 text-sm font-semibold">Ready to export ↗</p></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-3 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
          <div><p className="section-label">One beautiful flow</p><h2 className="display mt-4 text-5xl leading-[0.95] sm:text-6xl">From source to proof, without the mess.</h2></div>
          <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
            {[{ n: "01", title: "Bring the truth", body: "Upload the policy, handbook, procedure, or guide you already trust.", color: "bg-signal" }, { n: "02", title: "Shape the learning", body: "Review every lesson and question before anyone sees it.", color: "bg-sky" }, { n: "03", title: "Invite the team", body: "Assign the right version to the right people in a few deliberate clicks.", color: "bg-card" }, { n: "04", title: "Carry the proof", body: "Export completion evidence tied to the exact course version.", color: "bg-card" }].map((item) => <article key={item.n} className={`${item.color} min-h-60 p-7 sm:p-8`}><span className="text-[10px] font-bold tracking-[0.18em] text-ink-soft">{item.n}</span><h3 className="display mt-12 text-3xl">{item.title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-ink-soft">{item.body}</p></article>)}
          </div>
        </div>
      </section>
    </main>
  </div>;

  if (failed)
    return (
      <div className="px-6 pt-20 text-center">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-extrabold mt-4">Couldn&apos;t reach BookQuest</h1>
        <p className="text-ink-soft mt-2 text-sm">
          The server had a problem responding. Please check your connection and try
          again.
        </p>
        <button onClick={() => load()} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    );

  if (!loaded || me === null) return <Loading />;

  // ---------- Signed-in home ----------
  const isAdmin = me.role === "admin";
  return (
    <div className="page-wrap">
      <header className="mb-10 flex items-start justify-between gap-5">
        <div>
          <p className="section-label mb-3">Your workspace</p>
          <h1 className="page-heading">
            Welcome back, {me.name.split(" ")[0]}
          </h1>
          <p className="mt-3 text-sm text-ink-soft">Continue learning or make something worth remembering.</p>
        </div>
        <Link
          href="/profile"
          className="quiet-button shrink-0"
        >
          {isAdmin ? "Unlimited credits" : `${me.credits} credits`}
        </Link>
      </header>

      <label
        className={`premium-panel group block cursor-pointer p-7 text-center transition-all hover:-translate-y-0.5 sm:p-10 ${
          uploading ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.pptx,.md,.txt,.markdown"
          className="hidden"
          onChange={onFile}
        />
        <div className="relative z-10 mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-signal text-2xl text-ink transition-transform group-hover:rotate-6 group-hover:scale-105">{uploading ? "…" : "+"}</div>
        <div className="relative z-10 display text-3xl text-white sm:text-4xl">
          {uploading ? "Uploading…" : "Turn a document into a course"}
        </div>
        <div className="relative z-10 mt-2 text-xs text-white/45">
          PDF, DOCX, PPTX, MD or TXT · {generateWithAi ? "costs 1 credit" : "no AI, no credit"}
        </div>
      </label>
      <label className="mt-3 flex items-start gap-3 rounded-xl px-3 py-3 text-sm">
        <input type="checkbox" checked={generateWithAi} onChange={(event) => setGenerateWithAi(event.target.checked)} className="mt-1" />
        <span><span className="block font-bold">Generate lessons with AI</span><span className="block text-xs text-ink-soft">Turn this off to extract the document into an editable Studio draft without using a credit.</span></span>
      </label>
      {uploadError && (
        <p className="mt-2 text-sm text-no font-medium">
          {uploadError}{" "}
          {uploadError.includes("credit") && (
            <Link href="/profile" className="font-bold underline">
              Get credits
            </Link>
          )}
        </p>
      )}

      {enrolled.length > 0 && (
        <section className="mt-10">
          <h2 className="section-label mb-4">
            Learning
          </h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {enrolled.map((c) => (
              <CourseCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 pb-6">
        <h2 className="section-label mb-4">
          My courses
        </h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {owned.length === 0 && (
            <p className="mx-auto max-w-lg py-8 text-center text-sm text-ink-soft">
              No courses yet — upload your first document above, or{" "}
              <Link href="/explore" className="font-bold text-primary-deep">
                explore the library
              </Link>
              .
            </p>
          )}
          {owned.map((c) => (
            <CourseCard
              key={c.id}
              c={c}
              onRetry={async () => {
                await fetch(`/api/courses/${c.id}/retry`, { method: "POST" });
                load();
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
