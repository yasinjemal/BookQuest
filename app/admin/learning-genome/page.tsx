"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Loading from "@/components/Loading";

interface GenomeDashboard {
  eligibility: {
    source_events: number;
    public_events: number;
    consented_events: number;
    eligible_events: number;
  };
  analysis: null | {
    id: string;
    version: number;
    status: string;
    algorithm_version: string;
    minimum_learner_sample: number;
    eligible_event_count: number;
    limitations: string[];
  };
  quality: Array<{
    question_version_id: string;
    concept_label: string;
    attempts: number;
    unique_learners: number;
    correct_rate: number | null;
    skip_rate: number;
    confidence: number;
    flags: string[];
    review_decision: string | null;
  }>;
  mappings: Array<{ id: string; source_label: string; target_label: string; status: string }>;
  prerequisites: Array<{
    prerequisite_label: string;
    target_label: string;
    confidence: number;
    learner_sample: number;
  }>;
}

export default function LearningGenomeAdminPage() {
  const router = useRouter();
  const [data, setData] = useState<GenomeDashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/learning-genome", { cache: "no-store" });
    if (response.status === 401) return router.push("/login");
    if (response.status === 403) return router.push("/");
    setData(await response.json());
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/learning-genome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.error ?? "Request failed");
    setMessage("Saved. The evidence history remains immutable.");
    await load();
  }

  async function decide(questionVersionId: string, decision: "keep" | "revise" | "retire") {
    const reason = window.prompt(`Why ${decision} this version?`, "Human quality review");
    if (!reason) return;
    await act({
      action: "review_question",
      questionVersionId,
      analysisVersionId: data?.analysis?.id,
      decision,
      reason,
    });
  }

  if (!data) return <Loading />;
  return (
    <div className="page-wrap max-w-5xl">
      <Link href="/admin" className="text-sm font-bold text-primary-deep">← Admin</Link>
      <div className="flex items-start justify-between gap-4 mt-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold">Learning quality review</h1>
          <p className="text-sm text-ink-soft mt-1">
            Public, currently consented evidence only. Results are descriptive review prompts—not causal claims.
          </p>
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => act({ action: "build" })}
            className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-bold disabled:opacity-50">
            Build draft
          </button>
          {data.analysis?.status === "draft" && (
            <button disabled={busy} onClick={() => act({ action: "publish", analysisId: data.analysis?.id })}
              className="rounded-xl border border-line px-4 py-2 text-sm font-bold disabled:opacity-50">
              Publish v{data.analysis.version}
            </button>
          )}
        </div>
      </div>
      {message && <p className="rounded-xl bg-card border border-line p-3 text-sm mb-4">{message}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Source events", data.eligibility.source_events],
          ["Public", data.eligibility.public_events],
          ["Consented", data.eligibility.consented_events],
          ["Eligible", data.eligibility.eligible_events],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-card border border-line p-4 shadow-card">
            <div className="text-xl font-extrabold">{value}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-bold mt-7 mb-2">Current analysis</h2>
      {!data.analysis ? <p className="text-sm text-ink-soft">No analysis has been built.</p> : (
        <div className="rounded-2xl bg-card border border-line p-4">
          <p className="font-bold">Version {data.analysis.version} · {data.analysis.status}</p>
          <p className="text-xs text-ink-soft mt-1">
            {data.analysis.algorithm_version} · minimum sample {data.analysis.minimum_learner_sample}
          </p>
          <ul className="list-disc pl-5 mt-3 text-sm text-ink-soft">
            {data.analysis.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      <h2 className="font-bold mt-7 mb-2">Question review queue</h2>
      <div className="rounded-2xl bg-card border border-line divide-y divide-line">
        {data.quality.length === 0 && <p className="p-4 text-sm text-ink-soft">No eligible question evidence yet.</p>}
        {data.quality.map((item) => (
          <div key={item.question_version_id} className="p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold">{item.concept_label}</p>
                <p className="text-xs text-ink-soft">
                  {item.unique_learners} learners · {item.attempts} attempts · confidence {item.confidence.toFixed(2)}
                </p>
                <p className="text-xs text-ink-soft">
                  correct {item.correct_rate === null ? "n/a" : `${Math.round(item.correct_rate * 100)}%`} · skipped {Math.round(item.skip_rate * 100)}%
                </p>
              </div>
              <div className="flex gap-1 items-start">
                {(["keep", "revise", "retire"] as const).map((decision) => (
                  <button key={decision} disabled={busy} onClick={() => decide(item.question_version_id, decision)}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">
                    {decision}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs mt-2">
              {item.flags.length ? item.flags.join(" · ") : "No automated flags"}
              {item.review_decision ? ` · reviewed: ${item.review_decision}` : ""}
            </p>
          </div>
        ))}
      </div>

      <h2 className="font-bold mt-7 mb-2">Prerequisite candidates</h2>
      <p className="text-sm text-ink-soft">
        {data.prerequisites.length
          ? `${data.prerequisites.length} provenance-bearing candidate(s) await human validation.`
          : "No candidate passed the sample and precedence gates."}
      </p>
    </div>
  );
}
