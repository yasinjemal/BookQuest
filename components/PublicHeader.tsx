import Link from "next/link";

export default function PublicHeader() {
  return <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
    <Link href="/" className="flex items-center gap-3 font-semibold tracking-[-0.02em]"><span className="brand-mark text-ink" aria-hidden="true" />BookQuest</Link>
    <nav className="flex items-center gap-2 text-sm font-semibold" aria-label="Public navigation">
      <Link href="/solutions" className="hidden rounded-full px-3 py-2.5 text-ink-soft hover:bg-card lg:inline-flex">Solutions</Link>
      <Link href="/how-it-works" className="hidden rounded-full px-3 py-2.5 text-ink-soft hover:bg-card lg:inline-flex">How it works</Link>
      <Link href="/explore" className="hidden rounded-full px-3 py-2.5 text-ink-soft hover:bg-card md:inline-flex">Courses</Link>
      <Link href="/pricing" className="hidden rounded-full px-3 py-2.5 text-ink-soft hover:bg-card sm:inline-flex">Pricing</Link>
      <Link href="/login" className="rounded-full px-4 py-2.5 text-ink-soft">Sign in</Link>
      <Link href="/register" className="rounded-full bg-ink px-4 py-2.5 text-white">Start free</Link>
    </nav>
  </header>;
}
