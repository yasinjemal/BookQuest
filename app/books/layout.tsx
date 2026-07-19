import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reading Room",
  robots: { index: false, follow: false },
};

export default function BooksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
