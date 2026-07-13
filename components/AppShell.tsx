"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type IconName = "home" | "create" | "library" | "spaces" | "practice" | "account";

const items: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/create", label: "Create", icon: "create" },
  { href: "/explore", label: "Library", icon: "library" },
  { href: "/spaces", label: "Spaces", icon: "spaces" },
  { href: "/review", label: "Practice", icon: "practice" },
];

const mobileItems = [items[0], items[2], items[1], items[3], {
  href: "/profile", label: "Account", icon: "account" as IconName,
}];

const barePaths = [
  "/login", "/register", "/forgot-password", "/reset-password",
  "/verify-email", "/verify-credential", "/accessibility", "/security",
];

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
    create: <><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/></>,
    library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
    spaces: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    practice: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

function activePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/course/");
  if (href === "/create") return pathname.startsWith("/create") || pathname.startsWith("/studio/");
  return pathname.startsWith(href);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signedInHome, setSignedInHome] = useState(pathname !== "/");

  useEffect(() => {
    if (pathname !== "/") return;
    let current = true;
    void fetch("/api/me", { cache: "no-store" }).then((response) => {
      if (current) setSignedInHome(response.ok);
    }).catch(() => { if (current) setSignedInHome(false); });
    return () => { current = false; };
  }, [pathname]);

  const bare = barePaths.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/lesson/") || pathname.startsWith("/cert/");
  if (bare || (pathname === "/" && !signedInHome)) {
    return <main id="main-content" className="min-h-dvh">{children}</main>;
  }

  return <div className="min-h-dvh bg-paper">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] overflow-hidden border-r border-white/5 bg-sidebar px-4 py-5 text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -right-24 top-[-5rem] h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <Link href="/" className="relative mb-8 flex items-center gap-3 rounded-xl px-2 py-1.5 text-[15px] font-semibold tracking-[-0.02em] text-white">
        <span className="brand-mark text-white" aria-hidden="true" />
        <span>BookQuest</span>
      </Link>
      <Link href="/create" className="relative mb-7 flex items-center justify-between rounded-2xl bg-signal px-4 py-3.5 text-sm font-bold text-ink shadow-[0_12px_28px_rgba(220,250,114,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(220,250,114,0.2)]">
        <span>New course</span><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-white"><Icon name="create" className="h-3.5 w-3.5" /></span>
      </Link>
      <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">Workspace</p>
      <nav aria-label="Primary" className="space-y-1">
        {items.map((item) => {
          const active = activePath(pathname, item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "nav-item-active" : ""}`}>
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            {item.label}
          </Link>;
        })}
      </nav>
      <div className="relative mt-auto border-t border-white/10 pt-4">
        <Link href="/profile" className={`nav-item ${pathname.startsWith("/profile") ? "nav-item-active" : ""}`}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><Icon name="account" className="h-4 w-4" /></span>
          <span><span className="block text-sm">Account</span><span className="block text-[10px] font-normal text-white/35">Settings & privacy</span></span>
        </Link>
        <div className="mt-3 flex gap-3 px-3 text-[10px] text-white/30">
          <Link href="/security" className="hover:text-white">Security</Link>
          <Link href="/accessibility" className="hover:text-white">Accessibility</Link>
        </div>
      </div>
    </aside>

    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/5 bg-sidebar/95 px-5 text-white backdrop-blur-xl lg:hidden">
      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]"><span className="brand-mark scale-90 text-white" aria-hidden="true" />BookQuest</Link>
      <Link href="/profile" aria-label="Open account" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"><Icon name="account" className="h-[18px] w-[18px]" /></Link>
    </header>

    <div className="relative lg:pl-[268px]">
      <div className="pointer-events-none fixed right-[-12rem] top-[-12rem] h-[32rem] w-[32rem] rounded-full bg-sky/20 blur-3xl" />
      <main id="main-content" className="relative mx-auto min-h-dvh w-full max-w-7xl pb-28 lg:pb-14">{children}</main>
    </div>

    <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 overflow-hidden rounded-2xl border border-white/10 bg-sidebar/95 px-1 pb-[env(safe-area-inset-bottom)] text-white shadow-[0_20px_50px_rgba(6,22,16,0.28)] backdrop-blur-xl lg:hidden" aria-label="Primary">
      {mobileItems.map((item) => {
        const active = activePath(pathname, item.href);
        const create = item.href === "/create";
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${active ? "text-white" : "text-white/45"}`}>
          <span className={create ? "grid h-9 w-9 -translate-y-1 place-items-center rounded-full bg-signal text-ink shadow-[0_8px_20px_rgba(220,250,114,.2)]" : `grid h-7 w-9 place-items-center rounded-lg ${active ? "bg-white/10" : ""}`}><Icon name={item.icon} className="h-[18px] w-[18px]" /></span>
          {item.label}
        </Link>;
      })}
    </nav>
  </div>;
}
