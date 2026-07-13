"use client";

import { FormEvent, useState } from "react";

type VerifiedCredential = {
  displayCode: string;
  status: "active" | "revoked" | "expired";
  learnerName: string;
  course: { title: string; version: number };
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  evidenceHash: string;
};

export default function VerifyCredentialPage() {
  const [token, setToken] = useState("");
  const [credential, setCredential] = useState<VerifiedCredential | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCredential(null);
    try {
      const response = await fetch(`/api/credentials/verify?token=${encodeURIComponent(token.trim())}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "Credential could not be verified");
      else setCredential(result.credential);
    } catch {
      setError("Verification is temporarily unavailable");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-xl px-5 py-12">
    <h1 className="text-3xl font-extrabold">Verify a BookQuest credential</h1>
    <p className="mt-2 text-sm text-ink-soft">Enter the private verification token supplied by the learner. Display codes cannot be searched or enumerated.</p>
    <form onSubmit={verify} className="mt-6 rounded-2xl bg-card border border-line p-4 space-y-3">
      <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Private verification token" autoComplete="off" className="w-full rounded-xl border-2 border-line bg-paper px-4 py-3" />
      <button disabled={busy || token.trim().length < 32} className="w-full rounded-xl bg-primary text-white font-bold py-3 disabled:opacity-40">{busy ? "Verifying..." : "Verify credential"}</button>
    </form>
    {error && <p role="alert" className="mt-4 rounded-xl border border-no/40 bg-no/5 p-4 text-sm font-semibold text-no">{error}</p>}
    {credential && <section className="mt-5 rounded-2xl bg-card border border-line p-5 space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold">{credential.course.title}</h2><span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${credential.status === "active" ? "bg-go/10 text-go" : "bg-no/10 text-no"}`}>{credential.status}</span></div>
      <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm"><dt className="font-semibold text-ink-soft">Learner</dt><dd>{credential.learnerName}</dd><dt className="font-semibold text-ink-soft">Display code</dt><dd>{credential.displayCode}</dd><dt className="font-semibold text-ink-soft">Course version</dt><dd>{credential.course.version}</dd><dt className="font-semibold text-ink-soft">Issued</dt><dd>{new Date(credential.issuedAt).toLocaleString()}</dd><dt className="font-semibold text-ink-soft">Expires</dt><dd>{credential.expiresAt ? new Date(credential.expiresAt).toLocaleString() : "Never"}</dd>{credential.revocationReason && <><dt className="font-semibold text-ink-soft">Revocation</dt><dd>{credential.revocationReason}</dd></>}</dl>
      <details><summary className="cursor-pointer text-sm font-semibold">Evidence binding</summary><code className="mt-2 block break-all rounded-lg bg-paper p-3 text-xs">{credential.evidenceHash}</code></details>
    </section>}
  </main>;
}

