"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import AuthShell from "@/components/AuthShell";

export default function VerifyEmailClient({
  verified,
  invalid,
}: {
  verified: boolean;
  invalid: boolean;
}) {
  const [isVerified, setIsVerified] = useState(verified);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState("/create?welcome=1");

  useEffect(() => {
    const preview = sessionStorage.getItem("bookquest.verification-preview");
    const next = sessionStorage.getItem("bookquest.after-verification");
    if (next?.startsWith("/") && !next.startsWith("//")) setNextPath(next);
    if (preview) setPreviewUrl(preview);
    void fetch("/api/me")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.user?.email_verified_at) {
          setIsVerified(true);
          sessionStorage.removeItem("bookquest.verification-preview");
        }
      })
      .catch(() => undefined);
  }, []);

  async function resend() {
    setBusy(true);
    setMessage(null);
    setMessageIsError(false);
    try {
      const response = await fetch("/api/auth/verification/request", { method: "POST" });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.alreadyVerified ? "Your email is already verified." : "Verification link sent. Check your inbox and spam folder.");
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
          sessionStorage.setItem("bookquest.verification-preview", data.previewUrl);
        }
        if (data.alreadyVerified) setIsVerified(true);
      } else {
        setMessageIsError(true);
        setMessage(data.error ?? "Could not send another link.");
      }
    } catch {
      setMessageIsError(true);
      setMessage("BookQuest could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account protection"
      title={isVerified ? "Email verified" : "Verify your email"}
      description={isVerified ? "Your account email is confirmed. You can continue to your private workspace." : "Open the verification link we sent to your email. For security, it expires after 24 hours."}
    >
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${isVerified ? "border-go/25 bg-go-soft text-go-deep" : "border-line bg-card text-ink"}`} role="status">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isVerified ? "bg-go text-white" : "bg-sky text-teal-deep"}`}><AppIcon name={isVerified ? "check" : "source"} className="h-5 w-5" /></span>
        <div><p className="font-semibold">{isVerified ? "Your address is confirmed" : "Check the inbox for your account address"}</p><p className="mt-1 text-xs leading-5 opacity-80">{isVerified ? "Your next step will open without changing your saved work." : "The email may take a minute to arrive. You can safely request another link below."}</p></div>
      </div>
      {invalid && !isVerified && <p role="alert" className="field-error">That verification link is invalid or expired.</p>}
      {message && (
        <p role={messageIsError ? "alert" : "status"} className={messageIsError ? "field-error" : "field-success"}>
          {message}
        </p>
      )}
      {isVerified ? (
        <Link href={nextPath} className="btn-primary mt-6 w-full">
          {nextPath === "/create?welcome=1" ? "Create my first course" : "Continue"}
        </Link>
      ) : (
        <div className="mt-6 space-y-3">
          <button type="button" onClick={() => void resend()} disabled={busy} className="btn-primary w-full">
            {busy ? "Sending…" : "Send another link"}
          </button>
          {previewUrl && <a href={previewUrl} className="quiet-button w-full text-center text-sm">Open local development verification link</a>}
          <Link href="/" className="flex min-h-11 items-center justify-center text-sm font-semibold text-ink-soft hover:text-ink">Continue for now</Link>
        </div>
      )}
    </AuthShell>
  );
}
