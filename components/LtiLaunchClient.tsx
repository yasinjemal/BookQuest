"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LtiLaunchClient({ ticket }: { ticket: string }) {
  const router = useRouter();
  const [error, setError] = useState(ticket ? "" : "This LMS launch is unavailable.");
  useEffect(() => {
    if (!ticket) return;
    void (async () => {
      const response = await fetch("/api/lti/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }),
      });
      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/lti/launch?ticket=${ticket}`)}`); return;
      }
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "This LMS launch is unavailable."); return; }
      router.replace(`/course/${result.launch.courseId}`);
    })();
  }, [router, ticket]);
  return <main className="page-wrap"><section className="mx-auto max-w-xl panel text-center"><p className="section-label">Secure LMS launch</p><h1 className="display mt-2 text-4xl">{error ? "We could not open this course." : "Opening your course…"}</h1><p className="mt-4 text-sm leading-6 text-ink-soft">{error || "BookQuest is validating the one-time launch and your Space membership."}</p>{error && <Link href="/" className="btn-primary mt-6">Go to BookQuest</Link>}</section></main>;
}
