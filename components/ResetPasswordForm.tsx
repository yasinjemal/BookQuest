"use client";

import Link from "next/link";
import { useState } from "react";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not reset your password.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-6 pt-14">
      <div className="text-4xl">🔑</div>
      <h1 className="text-2xl font-extrabold mt-2">Choose a new password</h1>
      {done ? (
        <div className="mt-6 rounded-2xl border border-go/30 bg-go-soft p-4">
          <p className="font-semibold text-go">Your password has been changed.</p>
          <p className="text-sm text-ink-soft mt-1">
            For security, your previous sessions were signed out.
          </p>
          <Link
            href="/login"
            className="block text-center mt-4 rounded-xl bg-primary text-white font-bold py-3"
          >
            Sign in
          </Link>
        </div>
      ) : !token ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-no">This reset link is invalid.</p>
          <Link href="/forgot-password" className="font-bold text-primary-deep">
            Request another link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="New password (min 8 characters)"
            className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
          />
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Confirm new password"
            className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
          />
          {error && <p className="text-sm font-medium text-no">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-primary text-white font-bold py-3.5 border-b-4 border-amber-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
      )}
    </div>
  );
}
