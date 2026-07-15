import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deep Reads",
  robots: { index: false, follow: false },
};

export default function SummariesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
