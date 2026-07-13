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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-sidebar px-3 py-4 lg:flex lg:flex-col">
      <Link href="/" className="mb-5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-xs font-bold text-white">BQ</span>
        <span>BookQuest</span>
      </Link>
      <Link href="/create" className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink/90">
        <Icon name="create" className="h-4 w-4" /> New course
      </Link>
      <nav aria-label="Primary" className="space-y-0.5">
        {items.map((item) => {
          const active = activePath(pathname, item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "nav-item-active" : ""}`}>
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            {item.label}
          </Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <Link href="/profile" className={`nav-item ${pathname.startsWith("/profile") ? "nav-item-active" : ""}`}>
          <Icon name="account" className="h-[18px] w-[18px]" /> Account
        </Link>
        <div className="mt-2 flex gap-3 px-2 text-[11px] text-ink-soft">
          <Link href="/security" className="hover:text-ink">Security</Link>
          <Link href="/accessibility" className="hover:text-ink">Accessibility</Link>
        </div>
      </div>
    </aside>

    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-card/95 px-4 backdrop-blur lg:hidden">
      <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[10px] font-bold text-white">BQ</span>BookQuest</Link>
      <Link href="/profile" aria-label="Open account" className="grid h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-hover hover:text-ink"><Icon name="account" className="h-5 w-5" /></Link>
    </header>

    <div className="lg:pl-60">
      <main id="main-content" className="mx-auto min-h-dvh w-full max-w-6xl pb-24 lg:pb-12">{children}</main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Primary">
      {mobileItems.map((item) => {
        const active = activePath(pathname, item.href);
        const create = item.href === "/create";
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium ${active ? "text-ink" : "text-ink-soft"}`}>
          <span className={create ? "grid h-9 w-9 place-items-center rounded-lg bg-ink text-white" : "grid h-7 w-9 place-items-center rounded-md"}><Icon name={item.icon} className="h-5 w-5" /></span>
          {item.label}
        </Link>;
      })}
    </nav>
  </div>;
}
