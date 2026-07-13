"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AppIcon, { type AppIconName } from "@/components/AppIcon";

const items: Array<{ href: string; label: string; icon: AppIconName }> = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/explore", label: "Library", icon: "library" },
  { href: "/review", label: "Practice", icon: "practice" },
  { href: "/spaces", label: "Spaces", icon: "spaces" },
];

const mobileItems: Array<{ href: string; label: string; icon: AppIconName }> = [
  items[0],
  items[1],
  { href: "/create", label: "Create", icon: "create" },
  items[3],
  { href: "/profile", label: "Account", icon: "account" },
];

const barePaths = [
  "/login", "/register", "/forgot-password", "/reset-password",
  "/verify-email", "/verify-credential", "/accessibility", "/security",
];

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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] overflow-hidden border-r border-white/5 bg-sidebar px-4 py-5 text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -right-24 top-[-5rem] h-64 w-64 rounded-full bg-dusk/20 blur-3xl" />
      <Link href="/" className="relative mb-8 flex items-center gap-3 rounded-xl px-2 py-1.5 text-[15px] font-semibold tracking-[-0.02em] text-white">
        <span className="brand-mark text-white" aria-hidden="true" />
          <span><span className="block">BookQuest</span><span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.15em] text-white/65">Living story worlds</span></span>
      </Link>
      <Link href="/create" aria-current={activePath(pathname, "/create") ? "page" : undefined} className={`relative mb-7 flex min-h-12 items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition-all ${activePath(pathname, "/create") ? "bg-signal text-ink shadow-[0_12px_28px_rgba(216,255,99,0.16)]" : "border border-white/12 bg-white/[0.06] text-white hover:bg-white/10"}`}>
        <span>New course</span><span className={`grid h-7 w-7 place-items-center rounded-full ${activePath(pathname, "/create") ? "bg-ink text-white" : "bg-white/10 text-signal"}`}><AppIcon name="create" className="h-3.5 w-3.5" /></span>
      </Link>
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/65">Your library</p>
      <nav aria-label="Primary" className="space-y-1">
        {items.map((item) => {
          const active = activePath(pathname, item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "nav-item-active" : ""}`}>
            <AppIcon name={item.icon} className="h-[18px] w-[18px]" />
            <span className="flex-1">{item.label}</span>
            {active && <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />}
          </Link>;
        })}
      </nav>
      <div className="relative mt-auto border-t border-white/10 pt-4">
        <Link href="/profile" className={`nav-item ${pathname.startsWith("/profile") ? "nav-item-active" : ""}`}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><AppIcon name="account" className="h-4 w-4" /></span>
          <span><span className="block text-sm">Account</span><span className="block text-[10px] font-normal text-white/65">Settings & privacy</span></span>
        </Link>
        <div className="mt-3 flex gap-3 px-3 text-[10px] text-white/65">
          <Link href="/security" className="hover:text-white">Security</Link>
          <Link href="/accessibility" className="hover:text-white">Accessibility</Link>
        </div>
      </div>
    </aside>

    <header className="mobile-header sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-sidebar/95 px-4 text-white backdrop-blur-xl sm:px-6 lg:hidden">
      <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]"><span className="brand-mark scale-90 text-white" aria-hidden="true" />BookQuest</Link>
      <Link href="/profile" aria-label="Open account" className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-white/75 hover:bg-white/10 hover:text-white"><AppIcon name="account" className="h-[18px] w-[18px]" /></Link>
    </header>

    <div className="relative lg:pl-[248px]">
      <div className="pointer-events-none fixed right-[-12rem] top-[-12rem] hidden h-[32rem] w-[32rem] rounded-full bg-sky/20 blur-3xl xl:block" />
      <main id="main-content" className="app-main relative mx-auto min-h-dvh w-full max-w-[92rem]">{children}</main>
    </div>

    <nav className="mobile-bottom-nav fixed z-30 grid grid-cols-5 overflow-hidden rounded-[1.15rem] border border-white/10 bg-sidebar/95 px-1 text-white shadow-[0_20px_50px_rgba(6,22,16,0.28)] backdrop-blur-xl lg:hidden" aria-label="Primary">
      {mobileItems.map((item) => {
        const active = activePath(pathname, item.href);
        const create = item.href === "/create";
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${active ? "text-white" : "text-white/55"}`}>
          <span className={create ? `grid h-9 w-9 place-items-center rounded-full ${active ? "bg-signal text-ink" : "border border-signal/35 bg-signal/10 text-signal"}` : `grid h-8 w-10 place-items-center rounded-xl ${active ? "bg-white/10" : ""}`}><AppIcon name={item.icon} className="h-[18px] w-[18px]" /></span>
          <span className="max-w-full truncate px-0.5">{item.label}</span>
          {active && !create && <span className="absolute bottom-1.5 h-0.5 w-4 rounded-full bg-signal" aria-hidden="true" />}
        </Link>;
      })}
    </nav>
  </div>;
}
