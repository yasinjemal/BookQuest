"use client";
import { useState } from "react";

export default function ShareCourseButton({ slug, title, compact = false }: { slug: string; title: string; compact?: boolean }) {
  const [label, setLabel] = useState("Share course");
  async function share() {
    const url = `${window.location.origin}/c/${slug}`;
    try {
      if (navigator.share) await navigator.share({ title, text: `Learn ${title} on BookQuest`, url });
      else { await navigator.clipboard.writeText(url); setLabel("Link copied"); setTimeout(() => setLabel("Share course"), 2200); }
      void fetch(`/api/public/courses/${slug}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "share" }) });
    } catch (error) { if ((error as Error).name !== "AbortError") setLabel("Copy failed"); }
  }
  return <button type="button" onClick={() => void share()} className={compact ? "min-h-11 rounded-full border border-line-deep px-4 text-sm font-semibold" : "inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/15"}>{label}</button>;
}
