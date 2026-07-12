"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AcceptSpaceInvitationContent() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [message, setMessage] = useState("Accepting your invitation…");
  useEffect(() => {
    if (!token) { setMessage("This invitation link is incomplete."); return; }
    void fetch("/api/spaces/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => {
      if (response.status === 401) { router.push(`/login?next=${encodeURIComponent(`/spaces/invitations/accept?token=${token}`)}`); return; }
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? "Could not accept invitation"); return; }
      router.replace(`/spaces/${data.space.id}`);
    });
  }, [router, token]);
  return <div className="p-6"><h1 className="text-xl font-bold">Space invitation</h1><p className="text-sm text-ink-soft mt-2">{message}</p></div>;
}

export default function AcceptSpaceInvitationPage() {
  return <Suspense fallback={<div className="p-6 text-ink-soft">Opening invitation…</div>}><AcceptSpaceInvitationContent /></Suspense>;
}
