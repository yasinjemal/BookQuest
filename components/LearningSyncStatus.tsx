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
    <div className="fixed right-3 top-3 z-[80] rounded-full border border-white/15 bg-sidebar px-3 py-2 text-xs font-bold text-white shadow-lg" role="status" aria-live="polite">
      {status.online ? "Syncing" : "Offline"} · {status.pendingCount} pending
    </div>
  );
}
