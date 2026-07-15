"use client";

import { useEffect, useState } from "react";
import {
  getLearningOutboxStatus,
  LEARNING_OUTBOX_STATUS_EVENT,
  type LearningOutboxStatus,
} from "@/lib/answer-outbox";

export default function LearningSyncStatus() {
  const [status, setStatus] = useState<LearningOutboxStatus>(() => ({
    accountId: undefined,
    answerCount: 0,
    completionCount: 0,
    pendingCount: 0,
    online: true,
  }));

  useEffect(() => {
    const refresh = () => setStatus(getLearningOutboxStatus());
    refresh();
    window.addEventListener(LEARNING_OUTBOX_STATUS_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener(LEARNING_OUTBOX_STATUS_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  if (status.online && status.pendingCount === 0) return null;
  return (
    <div
      className="fixed right-3 top-3 z-[80] flex items-center gap-2 rounded-full border border-line bg-card/90 px-3 py-1.5 text-[11px] font-semibold text-ink-soft shadow-card backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${status.online ? "animate-pulse bg-teal" : "bg-ink-soft"}`}
        aria-hidden="true"
      />
      {status.online ? "Saving…" : "Offline — progress saved on this device"}
    </div>
  );
}
