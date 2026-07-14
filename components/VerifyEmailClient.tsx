"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  const [busy, setBusy] = useState(false);
  const [nextPath, setNextPath] = useState("/create?welcome=1");

  useEffect(() => {
    const preview = sessionStorage.getItem("bookquest.verification-preview");
    const next = sessionStorage.getItem("bookquest.after-verification");
    if (next?.startsWith("/") && !next.startsWith("//")) setNextPath(next);
    if (preview) setPreviewUrl(preview);
    void fetch("/api/me").then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.user?.email_verified_at) {
        setIsVerified(true);
        sessionStorage.removeItem("bookquest.verification-preview");
      }
    });
  }, []);

  async function resend() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/auth/verification/request", { method: "POST" });
    const data = await response.json();
    if (response.ok) {
      setMessage(data.alreadyVerified ? "Your email is already verified." : "Verification link sent.");
      if (data.previewUrl) {
        setPreviewUrl(data.previewUrl);
        sessionStorage.setItem("bookquest.verification-preview", data.previewUrl);
      }
      if (data.alreadyVerified) setIsVerified(true);
    } else {
      setMessage(data.error ?? "Could not send another link.");
    }
    setBusy(false);
  }

  return (
    <div className="px-6 pt-14 text-center">
      <div className="text-5xl">{isVerified ? "✅" : "✉️"}</div>
      <h1 className="text-2xl font-extrabold mt-3">
        {isVerified ? "Email verified" : "Verify your email"}
      </h1>
      <p className="text-sm text-ink-soft mt-2">
        {isVerified
          ? "Your account email is confirmed."
          : "Open the verification link we sent to your email. The link expires in 24 hours."}
      </p>
      {invalid && !isVerified && (
        <p className="text-sm font-semibold text-no mt-3">
          That verification link is invalid or expired.
        </p>
      )}
      {message && <p className="text-sm font-semibold mt-3">{message}</p>}
      {isVerified ? (
        <Link
          href={nextPath}
          className="block mt-6 rounded-2xl bg-primary text-white font-bold py-3.5"
        >
          {nextPath === "/create?welcome=1" ? "Create my first course" : "Continue"}
        </Link>
      ) : (
        <div className="mt-6 space-y-3">
          <button
            onClick={resend}
            disabled={busy}
            className="w-full rounded-2xl bg-primary text-white font-bold py-3.5 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send another link"}
          </button>
          {previewUrl && (
            <a href={previewUrl} className="block font-bold text-primary-deep underline">
              Open local development verification link
            </a>
          )}
          <Link href="/" className="block text-sm font-semibold text-ink-soft">
            Continue for now
          </Link>
        </div>
      )}
    </div>
  );
}
