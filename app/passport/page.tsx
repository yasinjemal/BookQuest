"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppIcon from "@/components/AppIcon";
import Loading from "@/components/Loading";

type Claim = {
  claimVersionId: string;
  title: string;
  statement: string;
  issuedAt: string;
  shareable: boolean;
  availability: "active" | "revoked" | "expired";
  evidence: {
    courseVersion: number;
    assignmentVersionId: string;
    completionRuleVersionId: string;
    completionEventId: string;
    credentialId: string;
    evidenceHash: string;
  };
};
type PassportData = {
  passport: { id: string; visibility: "private"; createdAt: string };
  claims: Claim[];
  eligibleCredentials: Array<{
    credentialId: string; courseTitle: string; courseVersion: number; issuedAt: string; expiresAt: string | null;
  }>;
  shares: Array<{
    id: string; status: "active" | "revoked" | "consent_withdrawn";
    includeLearnerName: boolean; expiresAt: string; createdAt: string; claimCount: number;
  }>;
  accessHistory: Array<{
    id: string; shareId: string; claimCount: number; learnerNameDisclosed: boolean;
    occurredAt: string; retainUntil: string;
  }>;
};

export default function PassportPage() {
  const router = useRouter();
  const [data, setData] = useState<PassportData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [includeName, setIncludeName] = useState(false);
  const [durationDays, setDurationDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/passport", { cache: "no-store" });
    if (response.status === 401) { router.push("/login?next=/passport"); return; }
    if (!response.ok) { setNotice("Your private Passport could not be opened."); return; }
    const next = await response.json() as PassportData;
    setData(next);
    setSelected((current) => current.filter((id) => next.claims.some((claim) => claim.claimVersionId === id && claim.shareable)));
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  const activeShares = useMemo(() => data?.shares.filter((share) =>
    share.status === "active" && Date.parse(share.expiresAt) > Date.now()) ?? [], [data]);

  async function addClaim(credentialId: string) {
    setBusy(credentialId); setNotice(null); setShareUrl(null);
    const response = await fetch("/api/passport/claims", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentialId }),
    });
    const result = await response.json();
    if (!response.ok) setNotice(result.error ?? "That credential could not be added.");
    else { setNotice("The verified completion is now in your private Passport."); await load(); }
    setBusy(null);
  }

  async function createShare() {
    setBusy("share"); setNotice(null); setShareUrl(null);
    const expiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
    const response = await fetch("/api/passport/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimVersionIds: selected, expiresAt, includeLearnerName: includeName }),
    });
    const result = await response.json();
    if (!response.ok) setNotice(result.error ?? "The share link could not be created.");
    else {
      const url = `${window.location.origin}/passport/verify?token=${encodeURIComponent(result.share.token)}`;
      setShareUrl(url);
      setNotice("A new private link is ready. Copy it now—the secret is shown only once.");
      await load();
    }
    setBusy(null);
  }

  async function shareAction(id: string, action: "revoke" | "withdraw_consent") {
    const label = action === "revoke" ? "Revoke this link?" : "Withdraw consent for this link?";
    if (!window.confirm(`${label} Anyone using it afterward will see only “not found”.`)) return;
    setBusy(id); setNotice(null); setShareUrl(null);
    const response = await fetch(`/api/passport/shares/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const result = await response.json();
    setNotice(response.ok ? (action === "revoke" ? "The link is revoked." : "Sharing consent is withdrawn.") : result.error ?? "The link could not be changed.");
    if (response.ok) await load();
    setBusy(null);
  }

  async function copyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setNotice("Private link copied.");
  }

  if (!data) return <Loading />;
  return <div className="page-wrap"><div className="content-measure max-w-6xl">
    <header className="relative overflow-hidden rounded-[1.8rem] bg-pine px-7 py-10 text-white shadow-pop sm:px-10 sm:py-14 lg:px-14">
      <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10" />
      <div className="absolute right-12 top-10 hidden h-44 w-32 rotate-6 rounded-[1.2rem] border border-white/15 bg-white/[.06] shadow-2xl md:block" />
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Private Skill Passport · early implementation</p>
      <h1 className="display mt-3 max-w-3xl text-[clamp(3.4rem,10vw,6.6rem)] leading-[.86]">Proof you choose to carry.</h1>
      <p className="mt-6 max-w-xl text-sm leading-6 text-white/70">Your Passport is invisible until you choose an exact claim, an expiry, and what identity to disclose. It is never a public profile.</p>
      <div className="mt-7 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-signal px-3 py-1.5 text-ink">Private by default</span><span className="rounded-full border border-white/15 px-3 py-1.5">{data.claims.length} verified claim{data.claims.length === 1 ? "" : "s"}</span><span className="rounded-full border border-white/15 px-3 py-1.5">{activeShares.length} active link{activeShares.length === 1 ? "" : "s"}</span></div>
    </header>

    {notice && <div role="status" className="mt-5 rounded-xl border border-teal/25 bg-teal/8 px-4 py-3 text-sm font-semibold text-teal-deep">{notice}</div>}
    {shareUrl && <section aria-labelledby="new-link-heading" className="mt-5 rounded-[1.5rem] border-2 border-teal bg-card p-5 shadow-pop sm:p-7"><p className="section-label">Shown once</p><h2 id="new-link-heading" className="display mt-2 text-3xl">Copy the private link now.</h2><p className="mt-2 text-xs leading-5 text-ink-soft">BookQuest stores only a digest of its secret. Recipients can copy what they see; revocation prevents future access but cannot erase copies they already made.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input readOnly value={shareUrl} aria-label="New private verification link" className="field min-w-0 flex-1 font-mono text-xs" /><button type="button" onClick={() => void copyShare()} className="btn-primary shrink-0"><AppIcon name="bookmark" className="h-4 w-4" />Copy link</button></div></section>}

    <section className="mt-12" aria-labelledby="claims-heading"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="section-label">Your evidence-backed claims</p><h2 id="claims-heading" className="display mt-2 text-4xl">Only verified completions belong here.</h2></div><span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-2 text-xs font-semibold text-ink-soft"><AppIcon name="lock" className="h-4 w-4" />Visible only to you</span></div>
      {data.claims.length === 0 ? <div className="mt-5 rounded-[1.5rem] border border-dashed border-line-deep bg-card px-6 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="shield" className="h-5 w-5" /></span><h3 className="display mt-4 text-3xl">Your Passport is quietly empty.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">Complete an eligible controlled assignment, then add its credential below. No claim is inferred from activity or scores.</p></div> : <div className="mt-5 grid gap-3">{data.claims.map((claim) => <label key={claim.claimVersionId} className={`grid gap-4 rounded-[1.35rem] border p-5 shadow-card sm:grid-cols-[auto_1fr_auto] sm:items-center ${!claim.shareable ? "cursor-not-allowed border-line bg-paper opacity-75" : selected.includes(claim.claimVersionId) ? "cursor-pointer border-teal bg-teal/[.04]" : "cursor-pointer border-line bg-card"}`}><input type="checkbox" disabled={!claim.shareable} checked={selected.includes(claim.claimVersionId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, claim.claimVersionId] : current.filter((id) => id !== claim.claimVersionId))} className="h-5 w-5 accent-teal" /><span><strong className="block text-base">{claim.title}</strong><span className="mt-1 block text-xs leading-5 text-ink-soft">{claim.statement} · issued {new Date(claim.issuedAt).toLocaleDateString()}</span>{!claim.shareable && <span className="mt-2 block text-xs font-semibold text-no">This historical claim is {claim.availability}. It stays in your private record but cannot be shared or verified.</span>}</span><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] ${claim.shareable ? "bg-go-soft text-forest" : "bg-line text-ink-soft"}`}>{claim.shareable ? "Evidence linked" : claim.availability}</span><details className="sm:col-start-2 sm:col-span-2"><summary className="text-xs font-semibold text-teal-deep">View exact evidence links</summary><dl className="mt-3 grid gap-2 break-all rounded-xl bg-paper p-4 font-mono text-[10px] text-ink-soft sm:grid-cols-2"><div><dt className="font-bold text-ink">Course version</dt><dd>{claim.evidence.courseVersion}</dd></div><div><dt className="font-bold text-ink">Credential</dt><dd>{claim.evidence.credentialId}</dd></div><div><dt className="font-bold text-ink">Assignment version</dt><dd>{claim.evidence.assignmentVersionId}</dd></div><div><dt className="font-bold text-ink">Rule version</dt><dd>{claim.evidence.completionRuleVersionId}</dd></div><div><dt className="font-bold text-ink">Completion decision</dt><dd>{claim.evidence.completionEventId}</dd></div><div><dt className="font-bold text-ink">Evidence hash</dt><dd>{claim.evidence.evidenceHash}</dd></div></dl></details></label>)}</div>}
    </section>

    {data.eligibleCredentials.length > 0 && <section className="mt-10 rounded-[1.5rem] bg-sky/45 p-6 sm:p-8" aria-labelledby="eligible-heading"><p className="section-label">Ready to add</p><h2 id="eligible-heading" className="display mt-2 text-3xl">Eligible verified completions</h2><div className="mt-5 space-y-3">{data.eligibleCredentials.map((credential) => <div key={credential.credentialId} className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><strong className="block">{credential.courseTitle}</strong><span className="mt-1 block text-xs text-ink-soft">Course version {credential.courseVersion} · issued {new Date(credential.issuedAt).toLocaleDateString()}</span></div><button type="button" disabled={busy === credential.credentialId} onClick={() => void addClaim(credential.credentialId)} className="btn-primary shrink-0">{busy === credential.credentialId ? "Adding…" : "Add verified claim"}</button></div>)}</div></section>}

    <section className="mt-12 grid gap-5 lg:grid-cols-[1.05fr_.95fr]" aria-label="Sharing controls">
      <div className="rounded-[1.5rem] border border-line bg-card p-6 shadow-card sm:p-8"><p className="section-label">Selective disclosure</p><h2 className="display mt-2 text-4xl">Share exactly what you mean to.</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Select claims above. Every new link freezes that selection and expires automatically.</p><fieldset className="mt-6"><legend className="text-xs font-bold uppercase tracking-[.12em] text-ink-soft">Link lifetime</legend><div className="mt-3 grid grid-cols-3 gap-2">{[1, 7, 30].map((days) => <label key={days} className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-sm font-semibold ${durationDays === days ? "border-ink bg-ink text-white" : "border-line bg-paper"}`}><input type="radio" name="duration" value={days} checked={durationDays === days} onChange={() => setDurationDays(days)} className="sr-only" />{days === 1 ? "24 hours" : `${days} days`}</label>)}</div></fieldset><label className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-paper p-4 text-sm"><input type="checkbox" checked={includeName} onChange={(event) => setIncludeName(event.target.checked)} className="mt-1 h-4 w-4 accent-teal" /><span><strong className="block">Include my display name</strong><span className="mt-1 block text-xs leading-5 text-ink-soft">Off by default. Email and account identifiers are never shared.</span></span></label><button type="button" disabled={selected.length === 0 || busy === "share"} onClick={() => void createShare()} className="btn-primary mt-5 w-full">{busy === "share" ? "Creating private link…" : `Create link for ${selected.length || "selected"} claim${selected.length === 1 ? "" : "s"}`}<AppIcon name="arrow" className="h-4 w-4" /></button></div>
      <div className="rounded-[1.5rem] border border-line bg-card p-6 shadow-card sm:p-8"><p className="section-label">Access control</p><h2 className="display mt-2 text-4xl">Every link can stop.</h2>{data.shares.length === 0 ? <p className="mt-5 text-sm leading-6 text-ink-soft">You have not created a share link. Claims remain visible only to you.</p> : <div className="mt-5 space-y-3">{data.shares.map((share) => { const expired = Date.parse(share.expiresAt) <= Date.now(); const active = share.status === "active" && !expired; return <article key={share.id} className="rounded-xl border border-line bg-paper p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{share.claimCount} selected claim{share.claimCount === 1 ? "" : "s"}</strong><p className="mt-1 text-xs text-ink-soft">{expired ? "Expired" : share.status === "consent_withdrawn" ? "Consent withdrawn" : share.status === "revoked" ? "Revoked" : `Expires ${new Date(share.expiresAt).toLocaleString()}`} · name {share.includeLearnerName ? "included" : "hidden"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${active ? "bg-go-soft text-forest" : "bg-line text-ink-soft"}`}>{active ? "Active" : "Closed"}</span></div>{active && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={busy === share.id} onClick={() => void shareAction(share.id, "revoke")} className="quiet-button text-xs">Revoke link</button><button type="button" disabled={busy === share.id} onClick={() => void shareAction(share.id, "withdraw_consent")} className="quiet-button text-xs">Withdraw consent</button></div>}</article>; })}</div>}</div>
    </section>

    <section className="mt-12 overflow-hidden rounded-[1.5rem] border border-line bg-card shadow-card" aria-labelledby="access-history-heading">
      <div className="grid gap-5 border-b border-line p-6 sm:p-8 lg:grid-cols-[1fr_.8fr] lg:items-end"><div><p className="section-label">Private access history</p><h2 id="access-history-heading" className="display mt-2 text-4xl">Know when a link was opened.</h2></div><p className="text-xs leading-5 text-ink-soft">BookQuest records a successful verification time—not who opened it. No recipient IP, device, location, account, referrer, or user agent is stored. Events disappear after 90 days or account erasure.</p></div>
      {data.accessHistory.length === 0 ? <div className="px-6 py-10 text-center sm:px-8"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="clock" className="h-5 w-5" /></span><h3 className="mt-4 text-sm font-bold">No successful verification yet</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-ink-soft">Unknown, expired, revoked and consent-withdrawn links never add entries here.</p></div> : <ol className="divide-y divide-line">{data.accessHistory.map((event) => <li key={event.id} className="grid gap-3 px-6 py-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-8"><span className="grid h-10 w-10 place-items-center rounded-full bg-go-soft text-forest"><AppIcon name="check" className="h-4 w-4" /></span><div><strong className="block text-sm">Private link opened</strong><p className="mt-1 text-xs text-ink-soft">{event.claimCount} claim{event.claimCount === 1 ? "" : "s"} verified · your name was {event.learnerNameDisclosed ? "shown" : "hidden"}</p></div><div className="text-left sm:text-right"><time dateTime={event.occurredAt} className="block text-xs font-semibold">{new Date(event.occurredAt).toLocaleString()}</time><span className="mt-1 block text-[10px] text-ink-soft">Retained until {new Date(event.retainUntil).toLocaleDateString()}</span></div></li>)}</ol>}
    </section>
    <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-5 text-ink-soft">Early Phase 4 implementation. No rankings, employability scores, hiring recommendations, public learner pages, or inferred competencies are created.</p>
  </div></div>;
}
