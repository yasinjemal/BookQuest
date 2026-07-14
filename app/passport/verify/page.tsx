"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppIcon from "@/components/AppIcon";

type Verification = {
  learnerName: string | null;
  expiresAt: string;
  verifiedAt: string;
  claims: Array<{
    claimVersionId: string; title: string; statement: string; issuedAt: string;
    evidence: {
      courseId: number; courseVersion: number; assignmentVersionId: string;
      completionRuleVersionId: string; completionEventId: string;
      participationId: string; credentialId: string; evidenceHash: string;
    };
  }>;
};

function Verifier() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [result, setResult] = useState<Verification | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "verified" | "not_found">("idle");

  async function verify(value = token) {
    if (!value.trim()) return;
    setState("loading"); setResult(null);
    const response = await fetch(`/api/passport/verify?token=${encodeURIComponent(value.trim())}`, { cache: "no-store" });
    if (!response.ok) { setState("not_found"); return; }
    const body = await response.json();
    setResult(body.passport); setState("verified");
  }
  useEffect(() => { const initial = params.get("token"); if (initial) void verify(initial); }, []); // verify an explicitly supplied bearer token once
  function submit(event: FormEvent) { event.preventDefault(); void verify(); }

  return <div className="min-h-dvh bg-paper px-4 py-8 sm:px-6 sm:py-12"><main className="mx-auto max-w-4xl">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold"><span className="brand-mark" aria-hidden="true" />BookQuest</Link>
    <section className="mt-8 overflow-hidden rounded-[1.8rem] border border-line bg-card shadow-pop">
      <header className="bg-pine px-6 py-9 text-white sm:px-10 sm:py-12"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-signal">Private verification</p><h1 className="display mt-3 text-[clamp(3rem,9vw,5.5rem)] leading-[.88]">Verify only what was shared.</h1><p className="mt-5 max-w-xl text-sm leading-6 text-white/70">This page does not search learners or credentials. It opens one selective, expiring disclosure when its secret is valid.</p></header>
      <div className="p-6 sm:p-10"><form onSubmit={submit}><label className="block text-sm font-semibold" htmlFor="passport-token">Private link token</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id="passport-token" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste the token from a BookQuest share link" className="field min-w-0 flex-1 font-mono text-xs" /><button disabled={!token.trim() || state === "loading"} className="btn-primary shrink-0">{state === "loading" ? "Checking…" : "Verify"}<AppIcon name="shield" className="h-4 w-4" /></button></div></form>
        {state === "not_found" && <div role="alert" className="mt-6 rounded-xl border border-line bg-paper p-5"><strong className="block">Shared passport not found</strong><p className="mt-2 text-sm leading-6 text-ink-soft">The link may be unknown or no longer available. For privacy, BookQuest does not reveal which condition applies. Ask the learner for a new link.</p></div>}
        {state === "verified" && result && <div className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5"><div><p className="section-label">Verified selective disclosure</p><h2 className="display mt-2 text-3xl">{result.learnerName ?? "Private learner"}</h2></div><span className="inline-flex items-center gap-2 rounded-full bg-go-soft px-3 py-2 text-xs font-bold text-forest"><AppIcon name="check" className="h-4 w-4" />Valid now</span></div><p className="mt-4 text-xs text-ink-soft">This disclosure expires {new Date(result.expiresAt).toLocaleString()}. Verification is live and may stop after revocation or consent withdrawal.</p><div className="mt-6 space-y-4">{result.claims.map((claim) => <article key={claim.claimVersionId} className="rounded-[1.3rem] border border-line bg-paper p-5 sm:p-6"><p className="section-label">Verified course completion</p><h3 className="display mt-2 text-3xl">{claim.title}</h3><p className="mt-3 text-sm leading-6 text-ink-soft">{claim.statement}</p><p className="mt-3 text-xs font-semibold">Issued {new Date(claim.issuedAt).toLocaleDateString()}</p><details className="mt-5"><summary className="text-xs font-bold text-teal-deep">Inspect exact evidence versions</summary><dl className="mt-3 grid gap-3 break-all rounded-xl border border-line bg-card p-4 font-mono text-[10px] text-ink-soft sm:grid-cols-2"><div><dt className="font-bold text-ink">Course</dt><dd>{claim.evidence.courseId} · version {claim.evidence.courseVersion}</dd></div><div><dt className="font-bold text-ink">Credential</dt><dd>{claim.evidence.credentialId}</dd></div><div><dt className="font-bold text-ink">Assignment version</dt><dd>{claim.evidence.assignmentVersionId}</dd></div><div><dt className="font-bold text-ink">Completion rule version</dt><dd>{claim.evidence.completionRuleVersionId}</dd></div><div><dt className="font-bold text-ink">Completion decision</dt><dd>{claim.evidence.completionEventId}</dd></div><div><dt className="font-bold text-ink">Participation</dt><dd>{claim.evidence.participationId}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-ink">Evidence hash</dt><dd>{claim.evidence.evidenceHash}</dd></div></dl></details></article>)}</div></div>}
      </div>
    </section>
    <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-ink-soft">BookQuest does not rank learners, infer employability, or make hiring recommendations from these claims.</p>
  </main></div>;
}

export default function PassportVerifyPage() {
  return <Suspense><Verifier /></Suspense>;
}
