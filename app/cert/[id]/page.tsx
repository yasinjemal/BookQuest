"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Loading from "@/components/Loading";

interface Cert {
  id: string;
  learner: string;
  course: string;
  score_pct: number;
  issued_at: string;
}

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const [cert, setCert] = useState<Cert | null | "missing">(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/cert/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCert(d?.certificate ?? "missing"))
      .catch(() => setCert("missing"));
  }, [id]);

  if (cert === null)
    return <Loading />;
  if (cert === "missing")
    return (
      <div className="p-8 text-center">
        <div className="text-4xl">❌</div>
        <h1 className="text-xl font-extrabold mt-3">Certificate not found</h1>
        <p className="text-sm text-ink-soft mt-1">
          This certificate ID is not valid.
        </p>
      </div>
    );

  const date = new Date(cert.issued_at + "Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="px-4 pt-8 pb-8">
      <div className="rounded-3xl border-4 border-primary/70 bg-card p-8 text-center shadow-lg">
        <div className="text-4xl">🎓</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink-soft mt-3">
          Certificate of Completion
        </div>
        <h1 className="text-2xl font-extrabold mt-4">{cert.learner}</h1>
        <p className="text-sm text-ink-soft mt-2">
          has successfully completed the course
        </p>
        <h2 className="text-lg font-bold text-primary-deep mt-1 leading-snug">
          “{cert.course}”
        </h2>
        <div className="flex justify-center gap-6 mt-5 text-sm">
          <div>
            <div className="font-extrabold">{cert.score_pct}%</div>
            <div className="text-[10px] text-ink-soft uppercase">Score</div>
          </div>
          <div>
            <div className="font-extrabold">{date}</div>
            <div className="text-[10px] text-ink-soft uppercase">Date</div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-line text-[10px] text-ink-soft">
          Verified certificate · ID {cert.id}
          <br />
          Anyone can verify this at this page&apos;s link.
        </div>
      </div>

      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="mt-4 w-full rounded-2xl bg-primary text-white font-bold py-3.5 border-b-4 border-primary-deep active:scale-[0.98] transition"
      >
        {copied ? "✓ Link copied!" : "🔗 Copy share link"}
      </button>
      <p className="text-center text-[10px] text-ink-soft mt-2">
        Share it on your CV, LinkedIn or with your employer.
      </p>
    </div>
  );
}
