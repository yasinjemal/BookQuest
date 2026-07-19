import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reading Edition",
  robots: { index: false, follow: false },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
