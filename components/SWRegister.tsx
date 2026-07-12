"use client";

import { useEffect } from "react";
import { startAnswerOutboxSync } from "@/lib/answer-outbox";

export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return startAnswerOutboxSync();
  }, []);
  return null;
}
