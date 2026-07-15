import Link from "next/link";

const groups = [
  {
    title: "Product",
    links: [
      ["How it works", "/how-it-works"],
      ["Explore courses", "/explore"],
      ["Pricing", "/pricing"],
      ["Live demo", "/demo"],
    ],
  },
  {
    title: "Solutions",
    links: [
      ["PDF to course", "/solutions/pdf-to-course"],
      ["AI course generator", "/solutions/ai-course-generator"],
      ["Employee training", "/solutions/employee-training"],
      ["Compliance training", "/solutions/compliance-training"],
      ["Course creators", "/solutions/course-creators"],
      ["Offline learning", "/solutions/offline-learning"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["About", "/about"],
      ["Security", "/security"],
      ["Accessibility", "/accessibility"],
      ["Verify a credential", "/verify-credential"],
    ],
  },
] as const;

export default function PublicFooter() {
  return (
    <footer className="border-t border-line bg-card/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_2fr] lg:py-16">
        <div>
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-[-0.02em]">
            <span className="brand-mark text-ink" aria-hidden="true" />
            BookQuest
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-ink-soft">
            Turn trusted documents into editable, source-backed learning people can use and verify.
          </p>
        </div>
        <nav className="grid gap-8 sm:grid-cols-3" aria-label="Footer navigation">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink">{group.title}</p>
              <ul className="mt-4 space-y-3 text-sm text-ink-soft">
                {group.links.map(([label, href]) => (
                  <li key={href}><Link href={href} className="hover:text-teal-deep">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-line px-5 py-5 text-center text-xs text-ink-soft">
        © {new Date().getFullYear()} BookQuest. Human review remains part of every responsible publishing workflow.
      </div>
    </footer>
  );
}

