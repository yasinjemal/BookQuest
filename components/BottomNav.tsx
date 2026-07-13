"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Learn", icon: "📚" },
  { href: "/create", label: "Create", icon: "✍️" },
  { href: "/explore", label: "Explore", icon: "🧭" },
  { href: "/spaces", label: "Spaces", icon: "🏫" },
  { href: "/review", label: "Practice", icon: "🎯" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();
  // Hide inside the lesson player and on auth screens
  if (
    pathname.startsWith("/lesson/") ||
    pathname === "/login" ||
    pathname === "/register"
  )
    return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-md flex px-1">
        {tabs.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/" || (pathname.startsWith("/course") && !pathname.startsWith("/studio"))
              : t.href === "/create"
                ? pathname.startsWith("/create") || pathname.startsWith("/studio")
              : t.href === "/spaces"
                ? pathname.startsWith("/spaces")
                : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`group flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-bold min-h-12 transition-colors ${
                active ? "text-primary-deep" : "text-ink-soft"
              }`}
            >
              <span
                className={`flex items-center justify-center h-8 w-11 rounded-full text-xl leading-none transition-colors ${
                  active ? "bg-primary/12" : "group-active:bg-line/60"
                }`}
              >
                {t.icon}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
