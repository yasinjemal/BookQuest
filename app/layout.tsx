import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SWRegister from "@/components/SWRegister";

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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto max-w-md min-h-dvh flex flex-col">
          <main className="flex-1 pb-20">{children}</main>
          <BottomNav />
          <SWRegister />
        </div>
      </body>
    </html>
  );
}
