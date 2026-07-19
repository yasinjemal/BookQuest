import Link from "next/link";

export default function PublicHeader() {
  return <header className="relative z-40 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
    <Link href="/" className="flex min-h-11 items-center gap-3 font-semibold tracking-[-0.02em]"><span className="brand-mark text-ink" aria-hidden="true" />BookQuest</Link>
    <nav className="flex items-center gap-2 text-sm font-semibold" aria-label="Public navigation">
      <div className="hidden items-center gap-1 lg:flex">
        <Link href="/solutions" className="rounded-full px-3 py-2.5 text-ink-soft hover:bg-card hover:text-ink">Solutions</Link>
        <Link href="/how-it-works" className="rounded-full px-3 py-2.5 text-ink-soft hover:bg-card hover:text-ink">How it works</Link>
        <Link href="/explore" className="rounded-full px-3 py-2.5 text-ink-soft hover:bg-card hover:text-ink">Courses</Link>
        <Link href="/pricing" className="rounded-full px-3 py-2.5 text-ink-soft hover:bg-card hover:text-ink">Pricing</Link>
        <Link href="/login" className="rounded-full px-4 py-2.5 text-ink-soft hover:bg-card hover:text-ink">Sign in</Link>
      </div>
      <details className="nav-popover group relative lg:hidden">
        <summary className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-deep bg-card/75 px-3.5 text-ink hover:bg-card" aria-label="Open navigation menu">
          <span className="grid gap-1" aria-hidden="true"><span className="h-0.5 w-4 rounded-full bg-current" /><span className="h-0.5 w-4 rounded-full bg-current" /><span className="h-0.5 w-4 rounded-full bg-current" /></span>
          <span className="hidden sm:inline">Menu</span>
        </summary>
        <div className="absolute right-0 top-[calc(100%+.75rem)] w-64 rounded-[1.25rem] border border-line bg-card p-2 text-ink shadow-pop">
          <p className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">Explore BookQuest</p>
          <Link href="/solutions" className="flex min-h-11 items-center rounded-xl px-3 hover:bg-paper">Solutions</Link>
          <Link href="/how-it-works" className="flex min-h-11 items-center rounded-xl px-3 hover:bg-paper">How it works</Link>
          <Link href="/explore" className="flex min-h-11 items-center rounded-xl px-3 hover:bg-paper">Courses</Link>
          <Link href="/pricing" className="flex min-h-11 items-center rounded-xl px-3 hover:bg-paper">Pricing</Link>
          <div className="my-2 h-px bg-line" />
          <Link href="/login" className="flex min-h-11 items-center rounded-xl px-3 hover:bg-paper">Sign in</Link>
        </div>
      </details>
      <Link href="/register" className="inline-flex min-h-11 items-center rounded-full bg-ink px-3.5 text-white hover:bg-sidebar sm:px-4"><span className="sm:hidden">Start</span><span className="hidden sm:inline">Start free</span></Link>
    </nav>
  </header>;
}
