"use client";

import { useEffect } from "react";
import { startAnswerOutboxSync } from "@/lib/answer-outbox";

export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "development") {
        void navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        );
        if ("caches" in window) {
          void caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key.startsWith("bookquest-")).map((key) => caches.delete(key))
          ));
        }
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
    return startAnswerOutboxSync();
  }, []);
  return null;
}
