import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import SWRegister from "@/components/SWRegister";

export const metadata: Metadata = {
  title: "BookQuest",
  description: "Turn trusted documents into clear, evidence-ready learning.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "BookQuest", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en">
    <body className="min-h-dvh">
      <AppShell>{children}</AppShell>
      <SWRegister />
    </body>
  </html>;
}
