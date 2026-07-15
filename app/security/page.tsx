import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Security and Institutional Controls",
  description: "Review BookQuest security controls, pilot data providers, credential verification, tenant roles, evidence versioning, and open external assurance work.",
  path: "/security",
});

export default function SecurityPage() {
  return <div className="min-h-dvh bg-paper">
    <PublicHeader />
    <article className="mx-auto max-w-4xl space-y-8 px-5 pb-20 pt-10 sm:px-8 sm:pt-16">
      <header><p className="section-label">Trust center</p><h1 className="display mt-4 text-[clamp(3.5rem,10vw,6rem)] leading-[.9]">Institutional security</h1><p className="mt-5 text-sm text-ink-soft">Pilot architecture summary — 13 July 2026</p></header>
      <p className="rounded-[1.25rem] border border-line bg-card p-6 text-sm leading-7 shadow-card">This is a factual implementation summary, not a certification or universal compliance claim. Contractual answers depend on the selected deployment, partner, and completed external assessment.</p>
      <section className="space-y-3"><h2 className="display text-4xl">Controls implemented</h2><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-ink-soft"><li>Deny-by-default tenant roles and read-only auditor access.</li><li>Authenticator MFA, one-time recovery codes, and versioned organization security policies.</li><li>Immutable course, rule, assignment, and evidence versions with evidence hashes.</li><li>Opaque credential verification with immediate expiry and revocation status.</li><li>Transactional migrations, tested restore and reconciliation, and scoped legal holds.</li><li>Automated dependency audit and scheduled update review.</li></ul></section>
      <section className="space-y-3"><h2 className="display text-4xl">Providers in the pilot data flow</h2><p className="text-sm leading-7 text-ink-soft">Vercel hosts the application, Neon hosts PostgreSQL, Anthropic is optional for generation, Resend is optional for transactional email, and Flutterwave is optional for checkout. Each provider and data class still requires partner procurement approval.</p></section>
      <section className="space-y-3"><h2 className="display text-4xl">Open release evidence</h2><p className="text-sm leading-7 text-ink-soft">A pilot-selected OIDC or SAML connection, independent penetration test, full accessibility audit, contracted runtime-region confirmation, and partner incident tabletop remain open. No certification is claimed.</p></section>
      <div className="flex flex-wrap gap-3 border-t border-line pt-7 text-sm"><Link href="/accessibility" className="font-semibold text-primary-deep">Read the accessibility statement →</Link><Link href="/solutions/compliance-training" className="font-semibold text-primary-deep">Review evidence controls →</Link></div>
    </article>
    <PublicFooter />
  </div>;
}

