import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import SWRegister from "@/components/SWRegister";

const editorial = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BookQuest",
  description: "Turn trusted sources into learning worlds people want to return to.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "BookQuest", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#102F26",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${editorial.variable} ${manrope.variable}`}>
    <body className="min-h-dvh">
      <AppShell>{children}</AppShell>
      <SWRegister />
    </body>
  </html>;
}
