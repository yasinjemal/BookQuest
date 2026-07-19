"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PublicCourseActions({ id, slug }: { id: number; slug: string }) {
  const router = useRouter(); const [signedIn, setSignedIn] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/me").then((r) => setSignedIn(r.ok)).catch(() => setSignedIn(false)); }, []);
  async function start() {
    if (!signedIn) { router.push(`/register?next=/c/${slug}`); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/courses/${id}/enroll`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "This course could not be added to your library.");
      router.push(`/course/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This course could not be opened. Try again.");
      setBusy(false);
    }
  }
  return <div><button type="button" onClick={() => void start()} disabled={busy || signedIn === null} className="btn-primary min-w-44">{busy ? "Adding to your library…" : signedIn === null ? "Checking access…" : signedIn === false ? "Start free" : "Start course"}</button>{error && <p role="alert" className="mt-3 max-w-sm rounded-xl border border-no/25 bg-no-soft px-3 py-2 text-xs font-semibold leading-5 text-no-deep">{error}</p>}</div>;
}
