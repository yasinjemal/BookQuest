"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAnswerOutboxAccount } from "@/lib/answer-outbox";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
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
      router.push("/");
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
      router.push(
        data.user && !data.user.email_verified_at ? "/verify-email" : "/"
      );
      router.refresh();
    } catch {
      setError("Network error — are you online?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-sidebar p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-paper shadow-pop sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-[.9fr_1.1fr]">
        <aside className="premium-panel relative m-3 hidden rounded-[1.5rem] p-10 lg:flex lg:flex-col lg:justify-between">
          <Link href="/" className="relative z-10 flex items-center gap-3 font-semibold text-white"><span className="brand-mark text-white" aria-hidden="true" />BookQuest</Link>
          <div className="relative z-10">
            <span className="eyebrow text-signal">Learning, with proof</span>
            <p className="display mt-7 text-[clamp(3.25rem,5vw,4.5rem)] leading-[0.9] text-white">Make useful knowledge <em className="text-signal">last.</em></p>
            <p className="mt-6 max-w-sm text-sm leading-6 text-white/75">A beautifully clear home for trusted training, deliberate learning, and evidence that holds up.</p>
          </div>
          <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">BookQuest · South Africa</p>
        </aside>
        <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-14 sm:px-10 lg:py-16">
      <Link href="/" className="mb-12 flex items-center gap-3 font-semibold lg:hidden"><span className="brand-mark text-ink" aria-hidden="true" />BookQuest</Link>
      <p className="section-label mb-4">{mode === "login" ? "Welcome back" : "Your workspace awaits"}</p>
        <h1 className="display text-[clamp(2.75rem,12vw,3.75rem)] leading-[0.95]">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-4 text-sm leading-6 text-ink-soft">
        {mode === "login"
          ? "Sign in to continue your work."
          : "Create a workspace and start with your first document."}
      </p>

      {mfaChallenge ? <form onSubmit={completeMfa} className="mt-6 space-y-3">
        <p className="text-sm text-ink-soft">Enter the 6-digit code from your authenticator, or one unused recovery code.</p>
        <input
          aria-label="Authenticator or recovery code"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          placeholder="Authenticator or recovery code"
          autoComplete="one-time-code"
          autoFocus
          className="field"
        />
        {error && <p className="text-sm font-medium text-no">{error}</p>}
        <button type="submit" disabled={busy || !mfaCode.trim()} className="btn-primary w-full">
          {busy ? "Verifying..." : "Verify and sign in"}
        </button>
        <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); }} className="w-full text-sm font-semibold text-primary-deep">Use a different account</button>
      </form> : <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "register" && (
          <input
            aria-label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="field"
          />
        )}
        <input
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          className="field"
        />
        {mode === "register" && (
          <label className="flex items-start gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={acceptedServiceTerms}
              onChange={(e) => setAcceptedServiceTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              I accept the service terms and privacy notice. Required learning
              evidence is kept pseudonymously; optional analytics and research
              consent can be changed from my profile.
            </span>
          </label>
        )}
        {mode === "login" && (
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm font-semibold text-primary-deep">
              Forgot password?
            </Link>
          </div>
        )}
        <input
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          className="field"
        />
        {error && <p className="text-sm font-medium text-no">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>}

      <p className="text-sm text-ink-soft mt-5 text-center">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/register" className="font-bold text-primary-deep">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-primary-deep">
              Sign in
            </Link>
          </>
        )}
      </p>
        </div>
      </div>
    </div>
  );
}
