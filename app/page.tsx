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
      className="group block rounded-lg border border-transparent bg-card px-4 py-3 transition-colors hover:border-line hover:bg-hover/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-medium truncate">{c.title}</h2>
          <p className="text-xs text-ink-soft truncate">
            {c.description || c.source_filename}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {!!c.published && (
            <span className="text-[10px] font-bold text-teal bg-teal/10 rounded-full px-2 py-1">
              PUBLISHED
            </span>
          )}
          {c.status === "ready" && (
            <span className="text-xs font-bold text-go bg-go-soft rounded-full px-2 py-1">
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
        <div className="mt-3 h-1 rounded-full bg-line overflow-hidden">
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
      setFailed((prev) => prev || me === null);
    } finally {
      setLoaded(true);
    }
  }, [me]);

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

  if (me === "anon") return <div className="min-h-dvh bg-card">
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-md bg-ink text-[11px] font-bold text-white">BQ</span>BookQuest</Link>
      <Link href="/login" className="quiet-button">Sign in</Link>
    </header>
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
      <div>
        <p className="section-label">Document-to-course workspace</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.06] tracking-[-0.045em] sm:text-6xl">Clear training from the documents you already trust.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-ink-soft">Upload a document, shape the course, assign it, and keep credible completion evidence in one calm workspace.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="btn-primary">Start with a document</Link><Link href="/verify-credential" className="btn-ghost">Verify a certificate</Link></div>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <div className="rounded-xl border border-line bg-card p-4 shadow-card">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-medium">Employee onboarding</p><p className="text-xs text-ink-soft">Ready to assign</p></div><span className="rounded-md bg-go-soft px-2 py-1 text-xs font-medium text-go">Reviewed</span></div>
          {["Upload the source", "Review the course", "Assign employees", "Export evidence"].map((step, index) => <div key={step} className="flex items-center gap-3 border-t border-line py-3 text-sm"><span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-semibold ${index < 2 ? "bg-ink text-white" : "bg-hover text-ink-soft"}`}>{index + 1}</span><span>{step}</span></div>)}
        </div>
        <div className="mt-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-3"><p className="rounded-lg bg-card p-3">Editable before publishing</p><p className="rounded-lg bg-card p-3">Mobile and offline ready</p><p className="rounded-lg bg-card p-3">Version-linked evidence</p></div>
      </div>
    </div>
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
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="page-heading">
            Welcome back, {me.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Continue learning or turn a document into a course.</p>
        </div>
        <Link
          href="/profile"
          className="quiet-button shrink-0"
        >
          {isAdmin ? "Unlimited credits" : `${me.credits} credits`}
        </Link>
      </header>

      <label
        className={`block rounded-xl border border-line bg-card p-6 text-center cursor-pointer transition-colors hover:bg-hover/30 ${
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
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-lg bg-hover text-lg text-ink-soft">{uploading ? "…" : "+"}</div>
        <div className="font-semibold">
          {uploading ? "Uploading…" : "Turn a document into a course"}
        </div>
        <div className="text-xs text-ink-soft mt-1">
          PDF, DOCX, PPTX, MD or TXT · {generateWithAi ? "costs 1 credit" : "no AI, no credit"}
        </div>
      </label>
      <label className="mt-3 flex items-start gap-3 rounded-lg px-2 py-2 text-sm">
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
        <section className="mt-6">
          <h2 className="section-label mb-2">
            Learning
          </h2>
          <div className="space-y-1">
            {enrolled.map((c) => (
              <CourseCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 pb-6">
        <h2 className="section-label mb-2">
          My courses
        </h2>
        <div className="space-y-1">
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
