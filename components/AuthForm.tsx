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
    <div className="mx-auto min-h-dvh max-w-md px-6 py-16">
      <Link href="/" className="mb-10 flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-md bg-ink text-[11px] font-bold text-white">BQ</span>BookQuest</Link>
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-sm text-ink-soft mt-1">
        {mode === "login"
          ? "Sign in to continue your work."
          : "Create a workspace and start with your first document."}
      </p>

      {mfaChallenge ? <form onSubmit={completeMfa} className="mt-6 space-y-3">
        <p className="text-sm text-ink-soft">Enter the 6-digit code from your authenticator, or one unused recovery code.</p>
        <input
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="field"
          />
        )}
        <input
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
  );
}
