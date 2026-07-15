"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOfflineCourseStatus,
  OFFLINE_CACHE_EVENT,
  saveCourseOffline,
} from "@/lib/offline-course-cache";

export default function OfflineCourseControls({
  accountId,
  courseId,
}: {
  accountId: number;
  courseId: number;
}) {
  const [saved, setSaved] = useState<{ version: number; savedAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => {
    void getOfflineCourseStatus(accountId, courseId).then(setSaved).catch(() => setSaved(null));
  }, [accountId, courseId]);

  useEffect(() => {
    load();
    window.addEventListener(OFFLINE_CACHE_EVENT, load);
    return () => window.removeEventListener(OFFLINE_CACHE_EVENT, load);
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const status = await saveCourseOffline(accountId, courseId);
      setSaved(status);
      setMessage(`Saved version ${status.version} for offline use.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this course offline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--course-line)] bg-[var(--course-canvas)] p-4" aria-label="Offline course access">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-[var(--course-ink)]">Offline course</p>
          <p className="text-xs text-[var(--course-ink-soft)] mt-1">
            {saved
              ? `Version ${saved.version} saved ${new Date(saved.savedAt).toLocaleString()}. Pending answers stay visible until synced.`
              : "Save an account-bound copy or download the portable JSON package."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void save()}
            className="rounded-full bg-[var(--course-primary)] px-4 py-2 text-xs font-bold text-[var(--course-on-primary)] disabled:opacity-50">
            {busy ? "Saving…" : saved ? "Update offline copy" : "Save offline"}
          </button>
          <a href={`/api/courses/${courseId}/offline-package?download=1`}
            className="rounded-full border border-[var(--course-line-deep)] px-4 py-2 text-xs font-bold text-[var(--course-ink-soft)]">
            Download JSON
          </a>
        </div>
      </div>
      {message && <p role="status" className="text-xs mt-2 text-[var(--course-ink-soft)]">{message}</p>}
    </section>
  );
}
