"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/AuthShell";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    setPreviewUrl(null);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not request a reset link.");
        return;
      }
      setMessage(data.message);
      setPreviewUrl(data.previewUrl ?? null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Account recovery" title="Reset your password" description="Enter the email for your BookQuest account. We’ll send a secure, time-limited reset link.">
      <form onSubmit={submit} className="space-y-4" aria-describedby={error ? "recovery-error" : message ? "recovery-status" : undefined}>
        <label htmlFor="recovery-email" className="field-label">Email address
          <input id="recovery-email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="field mt-2" />
        </label>
        {message && <p id="recovery-status" role="status" className="field-success">{message}</p>}
        {error && <p id="recovery-error" role="alert" className="field-error">{error}</p>}
        {previewUrl && <a href={previewUrl} className="quiet-button w-full text-center text-sm">Open local development reset link</a>}
        <button type="submit" disabled={busy || !email} className="btn-primary w-full">{busy ? "Sending reset link…" : "Send reset link"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft"><Link href="/login" className="font-bold text-primary-deep hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
