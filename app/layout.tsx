import type { Metadata, Viewport } from "next";
import { Baloo_2 } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SWRegister from "@/components/SWRegister";

// Self-hosted by Next (served from our own origin → cached by the service
// worker for offline use). `swap` means text paints instantly in the system
// fallback and re-flows when the rounded face arrives — no blank text on slow
// connections, which matters for the low-bandwidth audience.
const rounded = Baloo_2({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-rounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BookQuest",
  description: "Turn your books into bite-size, game-like courses.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "BookQuest", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  // Deliberately no maximumScale — users must be able to pinch-zoom (WCAG 1.4.4).
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={rounded.variable}>
      <body className="min-h-dvh">
        <div className="mx-auto max-w-md min-h-dvh flex flex-col">
          <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
          <BottomNav />
          <SWRegister />
        </div>
      </body>
    </html>
  );
}
