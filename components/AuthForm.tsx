"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAnswerOutboxAccount } from "@/lib/answer-outbox";
import AuthShell from "@/components/AuthShell";
import PasswordField from "@/components/PasswordField";

export default function AuthForm({ mode, nextPath }: { mode: "login" | "register"; nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedServiceTerms, setAcceptedServiceTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function completeMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: mfaChallenge, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Code could not be verified");
      if (data.user?.id) setAnswerOutboxAccount(data.user.id);
      router.push(nextPath || "/");
      router.refresh();
    } catch {
      setError("Network error - are you online?");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? { email, name, password, acceptedServiceTerms }
            : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      if (data.mfaRequired && data.challengeToken) {
        setMfaChallenge(data.challengeToken);
        return;
      }
      if (data.user?.id) setAnswerOutboxAccount(data.user.id);
      if (data.previewUrl && typeof window !== "undefined") {
        sessionStorage.setItem("bookquest.verification-preview", data.previewUrl);
      }
      if (mode === "register" && nextPath && typeof window !== "undefined") {
        sessionStorage.setItem("bookquest.after-verification", nextPath);
      }
      router.push(data.user && !data.user.email_verified_at ? "/verify-email" : (nextPath || "/"));
      router.refresh();
    } catch {
      setError("Network error — are you online?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow={mfaChallenge ? "Secure sign in" : mode === "login" ? "Welcome back" : "Your workspace awaits"}
      title={mfaChallenge ? "Confirm it’s you" : mode === "login" ? "Welcome back" : "Create your account"}
      description={mfaChallenge
        ? "Use the current code from your authenticator, or one unused recovery code."
        : mode === "login"
          ? "Sign in to continue your courses, sources, and saved progress."
          : "Create a private workspace and start with your first trusted document."}
    >
      {mfaChallenge ? (
        <form onSubmit={completeMfa} className="space-y-4" aria-describedby={error ? "auth-error" : undefined}>
          <label htmlFor="mfa-code" className="field-label">Authenticator or recovery code
            <input
              id="mfa-code"
              name="mfa-code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              autoComplete="one-time-code"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              required
              className="field mt-2"
            />
          </label>
          {error && <p id="auth-error" role="alert" className="field-error">{error}</p>}
          <button type="submit" disabled={busy || !mfaCode.trim()} className="btn-primary w-full">
            {busy ? "Verifying…" : "Verify and sign in"}
          </button>
          <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); setError(null); }} className="quiet-button w-full">Use a different account</button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-4" aria-describedby={error ? "auth-error" : undefined}>
          {mode === "register" && <label htmlFor="name" className="field-label">Your name
            <input id="name" name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required className="field mt-2" />
          </label>}
          <label htmlFor="email" className="field-label">Email address
            <input id="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="field mt-2" />
          </label>
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 8 : undefined}
            hint={mode === "register" ? "Use at least 8 characters. A longer, unique passphrase is safer." : undefined}
          />
          {mode === "login" && <div className="text-right"><Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-deep hover:underline">Forgot password?</Link></div>}
          {mode === "register" && <label className="flex min-h-11 items-start gap-3 rounded-xl border border-line bg-card/60 p-4 text-xs leading-5 text-ink-soft">
            <input type="checkbox" checked={acceptedServiceTerms} onChange={(event) => setAcceptedServiceTerms(event.target.checked)} required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]" />
            <span>I accept the service terms and privacy notice. Required learning evidence is kept pseudonymously; optional analytics and research consent can be changed from my profile.</span>
          </label>}
          {error && <p id="auth-error" role="alert" className="field-error">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? (mode === "login" ? "Signing in…" : "Creating your workspace…") : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      )}

      {mode === "register" && !mfaChallenge && <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-ink-soft" aria-label="Account benefits"><span>Private by default</span><span>Human reviewed</span><span>No card required</span></div>}
      <p className="mt-6 text-center text-sm text-ink-soft">
        {mode === "login" ? <>New here? <Link href="/register" className="font-bold text-primary-deep hover:underline">Create an account</Link></> : <>Already have an account? <Link href="/login" className="font-bold text-primary-deep hover:underline">Sign in</Link></>}
      </p>
    </AuthShell>
  );
}
