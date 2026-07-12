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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register" ? { email, name, password } : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
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
    <div className="px-6 pt-14">
      <div className="text-4xl">📖</div>
      <h1 className="text-2xl font-extrabold mt-2">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-sm text-ink-soft mt-1">
        {mode === "login"
          ? "Sign in to keep your streak going."
          : "Join BookQuest and get 3 free course generations."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "register" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
        />
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
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
        />
        {error && <p className="text-sm font-medium text-no">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-primary text-white font-bold py-3.5 border-b-4 border-amber-700 active:scale-[0.98] transition disabled:opacity-50"
        >
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

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
