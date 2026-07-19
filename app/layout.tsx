import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Literata, Manrope } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import SWRegister from "@/components/SWRegister";
import LearningSyncStatus from "@/components/LearningSyncStatus";
import JsonLd from "@/components/JsonLd";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

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

const reader = Literata({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-reader",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: "BookQuest — Turn PDFs and Documents Into Interactive Courses",
    template: "%s | BookQuest",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "education",
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  appleWebApp: { capable: true, title: "BookQuest", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "en_ZA",
    url: "/",
    siteName: SITE_NAME,
    title: "BookQuest — Turn PDFs and Documents Into Interactive Courses",
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "BookQuest — source-backed interactive courses" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BookQuest — Turn PDFs and Documents Into Interactive Courses",
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#102F26",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${editorial.variable} ${manrope.variable} ${reader.variable}`}>
    <body className="min-h-dvh">
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "Organization", "@id": `${absoluteUrl("/")}#organization`, name: SITE_NAME, url: absoluteUrl("/"), logo: absoluteUrl("/icon.svg"), description: SITE_DESCRIPTION },
        { "@context": "https://schema.org", "@type": "WebSite", "@id": `${absoluteUrl("/")}#website`, name: SITE_NAME, url: absoluteUrl("/"), publisher: { "@id": `${absoluteUrl("/")}#organization` } },
        { "@context": "https://schema.org", "@type": "SoftwareApplication", name: SITE_NAME, url: absoluteUrl("/"), applicationCategory: "EducationalApplication", operatingSystem: "Web", description: SITE_DESCRIPTION, offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan available" }, featureList: ["Document-to-course creation", "Editable lessons and quizzes", "Source traceability", "Course publishing and assignments", "Progress and credential evidence", "Supported offline learning"] },
      ]} />
      <AppShell>{children}</AppShell>
      <LearningSyncStatus />
      <SWRegister />
    </body>
  </html>;
}
