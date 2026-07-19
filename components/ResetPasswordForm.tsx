"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/AuthShell";
import PasswordField from "@/components/PasswordField";

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
    <AuthShell eyebrow="Secure recovery" title={done ? "Password changed" : "Choose a new password"} description={done ? "Your previous sessions were signed out to protect your account." : "Use a unique passphrase you do not use for another service."}>
      {done ? (
        <div className="field-success" role="status">
          <p>Your password has been changed.</p>
          <Link href="/login" className="btn-primary mt-4 w-full">Sign in securely</Link>
        </div>
      ) : !token ? (
        <div className="field-error" role="alert">
          <p>This reset link is invalid or has expired.</p>
          <Link href="/forgot-password" className="quiet-button mt-4 w-full bg-card text-ink">Request another link</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" aria-describedby={error ? "reset-error" : undefined}>
          <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} hint="Use at least 8 characters. A longer, unique passphrase is safer." />
          <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
          {error && <p id="reset-error" role="alert" className="field-error">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Saving new password…" : "Change password"}</button>
        </form>
      )}
    </AuthShell>
  );
}
