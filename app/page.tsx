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
      className="card block p-4 active:scale-[0.99] transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold truncate">{c.title}</h2>
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
        <div className="mt-3 h-2 rounded-full bg-line overflow-hidden">
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

  // ---------- Logged-out landing ----------
  if (me === "anon") {
    return (
      <div className="px-6 pt-16 text-center">
        <div className="text-6xl">📖</div>
        <h1 className="text-3xl font-extrabold mt-4 leading-tight">
          Any book.
          <br />
          <span className="text-primary-deep">A game you play to learn.</span>
        </h1>
        <p className="text-ink-soft mt-4">
          Upload a PDF or document — BookQuest turns it into bite-size lessons
          with quizzes, XP and streaks. Made for learning anywhere, even
          offline.
        </p>
        <div className="mt-8 space-y-3">
          <Link href="/register" className="btn-primary w-full">
            Get started — it&apos;s free
          </Link>
          <Link href="/login" className="btn-ghost w-full">
            Sign in
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-3 gap-2 text-xs font-semibold text-ink-soft">
          <div className="card p-3">
            <div className="text-2xl mb-1">🎮</div>
            Learn like a game
          </div>
          <div className="card p-3">
            <div className="text-2xl mb-1">📴</div>
            Works offline
          </div>
          <div className="card p-3">
            <div className="text-2xl mb-1">🎁</div>
            3 free courses
          </div>
        </div>
      </div>
    );
  }

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
    <div className="px-4 pt-6">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Hi, {me.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-ink-soft">Ready to learn something?</p>
        </div>
        <Link
          href="/profile"
          className="shrink-0 rounded-full bg-primary/10 border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary-deep"
        >
          ⚡ {isAdmin ? "∞" : me.credits}
        </Link>
      </header>

      <label
        className={`block rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 p-5 text-center cursor-pointer active:scale-[0.99] transition ${
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
        <div className="text-3xl mb-1">{uploading ? "⏳" : "📖"}</div>
        <div className="font-bold">
          {uploading ? "Uploading…" : "Turn a document into a course"}
        </div>
        <div className="text-xs text-ink-soft mt-1">
          PDF, DOCX, PPTX, MD or TXT · {generateWithAi ? "costs 1 credit" : "no AI, no credit"}
        </div>
      </label>
      <label className="mt-3 flex items-start gap-3 rounded-xl border border-line bg-card p-3 text-sm">
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
          <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mb-2">
            Learning
          </h2>
          <div className="space-y-3">
            {enrolled.map((c) => (
              <CourseCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 pb-6">
        <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mb-2">
          My courses
        </h2>
        <div className="space-y-3">
          {owned.length === 0 && (
            <p className="text-center text-ink-soft text-sm py-6">
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
