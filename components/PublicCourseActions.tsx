"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PublicCourseActions({ id, slug }: { id: number; slug: string }) {
  const router = useRouter(); const [signedIn, setSignedIn] = useState<boolean | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/me").then((r) => setSignedIn(r.ok)).catch(() => setSignedIn(false)); }, []);
  async function start() {
    if (!signedIn) { router.push(`/register?next=/c/${slug}`); return; }
    setBusy(true); const response = await fetch(`/api/courses/${id}/enroll`, { method: "POST" });
    if (response.ok) router.push(`/course/${id}`); else setBusy(false);
  }
  return <button type="button" onClick={() => void start()} disabled={busy || signedIn === null} className="btn-primary min-w-44">{busy ? "Opening…" : signedIn === false ? "Start free" : "Start course"}</button>;
}
