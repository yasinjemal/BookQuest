"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
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
    <div className="px-6 pt-14">
      <div className="text-4xl">🔐</div>
      <h1 className="text-2xl font-extrabold mt-2">Reset your password</h1>
      <p className="text-sm text-ink-soft mt-1">
        Enter your email and we’ll send a secure reset link.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="email"
          required
          placeholder="Email"
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
        />
        {message && <p className="text-sm font-medium text-go">{message}</p>}
        {error && <p className="text-sm font-medium text-no">{error}</p>}
        {previewUrl && (
          <a
            href={previewUrl}
            className="block text-sm font-bold text-primary-deep underline"
          >
            Open local development reset link
          </a>
        )}
        <button
          type="submit"
          disabled={busy || !email}
          className="w-full rounded-2xl bg-primary text-white font-bold py-3.5 border-b-4 border-amber-700 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-sm text-center mt-5">
        <Link href="/login" className="font-bold text-primary-deep">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
