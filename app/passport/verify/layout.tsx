import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify a private Skill Passport · BookQuest",
  robots: { index: false, follow: false, nocache: true },
};

export default function PassportVerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
