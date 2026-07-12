"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Learn", icon: "📚" },
  { href: "/explore", label: "Explore", icon: "🧭" },
  { href: "/classes", label: "Classes", icon: "🏫" },
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
    <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-card">
      <div className="mx-auto max-w-md flex">
        {tabs.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/" || pathname.startsWith("/course")
              : t.href === "/classes"
                ? pathname.startsWith("/classes") || pathname.startsWith("/class/")
                : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${
                active ? "text-primary-deep" : "text-ink-soft"
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
