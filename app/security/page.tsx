import Link from "next/link";

export default function SecurityPage() {
  return <article className="px-5 py-10 space-y-6">
    <header><p className="text-sm font-semibold text-primary-deep">BookQuest</p><h1 className="mt-1 text-3xl font-extrabold">Institutional security</h1><p className="mt-2 text-sm text-ink-soft">Pilot architecture summary - 13 July 2026</p></header>
    <p className="rounded-xl border border-line bg-card p-4 text-sm leading-6">This is a factual implementation summary, not a certification or universal compliance claim. Contractual answers depend on the selected deployment, partner and completed external assessment.</p>
    <section className="space-y-2"><h2 className="text-xl font-bold">Controls implemented</h2><ul className="list-disc pl-5 text-sm leading-6"><li>Deny-by-default tenant roles and read-only auditor access.</li><li>Authenticator MFA, one-time recovery codes and versioned organization security policies.</li><li>Immutable course, rule, assignment and evidence versions with evidence hashes.</li><li>Opaque credential verification with immediate expiry and revocation status.</li><li>Transactional migrations, tested restore/reconciliation and scoped legal holds.</li><li>Automated dependency audit and scheduled update review.</li></ul></section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Providers in the pilot data flow</h2><p className="text-sm leading-6">Vercel hosts the application, Neon hosts PostgreSQL, Anthropic is optional for generation, Resend is optional for transactional email and Flutterwave is optional for checkout. Each provider and data class still requires partner procurement approval.</p></section>
    <section className="space-y-2"><h2 className="text-xl font-bold">Open release evidence</h2><p className="text-sm leading-6">A pilot-selected OIDC or SAML connection, independent penetration test, full accessibility audit, contracted runtime-region confirmation and partner incident tabletop remain open. No certification is claimed.</p></section>
    <p className="text-sm"><Link href="/accessibility" className="font-semibold text-primary-deep">Read the accessibility statement</Link></p>
  </article>;
}

