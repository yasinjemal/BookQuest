import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Verify a Learning Credential",
  description: "Check the current status, learner, course version, issue date, expiry, revocation state, and evidence hash for a BookQuest credential.",
  path: "/verify-credential",
});

export default function VerifyCredentialLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper"><PublicHeader /><main>{children}</main><PublicFooter /></div>;
}

