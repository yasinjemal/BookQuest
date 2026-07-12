"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

interface Data {
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    credits: number;
    premium_until: string | null;
  };
  stats: { total_xp: number; streak: number };
  dueReviews: number;
  leaderboard: { user_id: number; name: string; xp: number }[];
  certificates: { id: string; course_title: string; score_pct: number }[];
}

const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000];

const STORE = [
  { id: "credits_5", icon: "⚡", title: "5 credits", sub: "Turn 5 documents into courses", price: "$2.99" },
  { id: "credits_15", icon: "⚡", title: "15 credits", sub: "Best value credit pack", price: "$6.99" },
  { id: "premium_month", icon: "👑", title: "Premium · 1 month", sub: "15 credits + premium badge", price: "$4.99" },
];

function ProfileInner() {
  const router = useRouter();
  const search = useSearchParams();
  const payment = search.get("payment");
  const [data, setData] = useState<Data | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    payment === "success"
      ? "✅ Payment received — thank you!"
      : payment === "failed"
        ? "Payment didn't complete. You were not charged."
        : payment === "cancelled"
          ? "Payment cancelled."
          : null
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/stats");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function buy(product: string) {
    setBuying(product);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const result = await res.json();
      if (!res.ok) {
        setNotice(result.error ?? "Could not start payment.");
      } else if (result.link) {
        window.location.href = result.link; // Flutterwave checkout
      } else if (result.simulated) {
        setNotice("✅ Test-mode purchase complete (no real payment).");
        await load();
      }
    } catch {
      setNotice("Network error — are you online?");
    } finally {
      setBuying(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!data) return <p className="p-8 text-center text-ink-soft">Loading…</p>;

  const { user, stats } = data;
  const isAdmin = user.role === "admin";
  const premium =
    !!user.premium_until && user.premium_until > new Date().toISOString();
  const xp = stats.total_xp;
  let level = 1;
  while (level < LEVELS.length && xp >= LEVELS[level]) level++;
  const prev = LEVELS[level - 1];
  const next = LEVELS[Math.min(level, LEVELS.length - 1)];
  const pct =
    next > prev ? Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100)) : 100;

  return (
    <div className="px-4 pt-6 pb-8">
      <header className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold">
            {user.name} {premium && "👑"}
          </h1>
          <p className="text-xs text-ink-soft">{user.email}</p>
        </div>
        <button
          onClick={logout}
          className="text-xs font-bold text-ink-soft border border-line rounded-lg px-3 py-1.5"
        >
          Sign out
        </button>
      </header>

      {notice && (
        <div className="mb-4 rounded-xl bg-teal/10 border border-teal/30 px-4 py-3 text-sm font-semibold text-teal">
          {notice}
        </div>
      )}

      {/* Level */}
      <div className="rounded-2xl bg-card border border-line p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-extrabold text-lg">Level {level}</span>
          <span className="text-sm text-ink-soft">{xp} / {next} XP</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-line overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="rounded-2xl bg-card border border-line p-4 text-center shadow-sm">
          <div className="text-2xl">🔥</div>
          <div className="text-xl font-extrabold">{stats.streak}</div>
          <div className="text-[10px] text-ink-soft">streak</div>
        </div>
        <div className="rounded-2xl bg-card border border-line p-4 text-center shadow-sm">
          <div className="text-2xl">⚡</div>
          <div className="text-xl font-extrabold">{isAdmin ? "∞" : user.credits}</div>
          <div className="text-[10px] text-ink-soft">credits</div>
        </div>
        <div className="rounded-2xl bg-card border border-line p-4 text-center shadow-sm">
          <div className="text-2xl">🏆</div>
          <div className="text-xl font-extrabold">{xp}</div>
          <div className="text-[10px] text-ink-soft">total XP</div>
        </div>
      </div>

      {data.dueReviews > 0 && (
        <Link
          href="/review"
          className="mt-3 block rounded-2xl bg-teal/10 border border-teal/30 p-4 text-center font-bold text-teal active:scale-[0.99] transition"
        >
          🔁 {data.dueReviews} question{data.dueReviews === 1 ? "" : "s"} ready to review
        </Link>
      )}

      {/* Store */}
      <section className="mt-6">
        <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mb-2">
          Get more
        </h2>
        <div className="space-y-2.5">
          {STORE.map((p) => (
            <button
              key={p.id}
              onClick={() => buy(p.id)}
              disabled={buying !== null}
              className="w-full flex items-center gap-3 rounded-2xl bg-card border border-line p-4 shadow-sm active:scale-[0.99] transition disabled:opacity-50 text-left"
            >
              <span className="text-2xl">{p.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold">{p.title}</span>
                <span className="block text-xs text-ink-soft">{p.sub}</span>
              </span>
              <span className="shrink-0 font-extrabold text-primary-deep">
                {buying === p.id ? "…" : p.price}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-ink-soft mt-2">
          Payments by Flutterwave — cards & mobile money across Africa.
        </p>
      </section>

      {/* Certificates */}
      {data.certificates.length > 0 && (
        <section className="mt-6">
          <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mb-2">
            🎓 Certificates
          </h2>
          <div className="space-y-2">
            {data.certificates.map((c) => (
              <Link
                key={c.id}
                href={`/cert/${c.id}`}
                className="flex items-center gap-3 rounded-2xl bg-card border border-line p-4 shadow-sm active:scale-[0.99] transition"
              >
                <span className="text-2xl">🎓</span>
                <span className="flex-1 min-w-0 font-semibold truncate">
                  {c.course_title}
                </span>
                <span className="shrink-0 text-sm font-bold text-go">
                  {c.score_pct}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Leaderboard */}
      <section className="mt-6">
        <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mb-2">
          This week&apos;s leaderboard
        </h2>
        <div className="rounded-2xl bg-card border border-line shadow-sm divide-y divide-line">
          {data.leaderboard.length === 0 && (
            <p className="p-4 text-sm text-ink-soft text-center">
              Complete a lesson to appear here!
            </p>
          )}
          {data.leaderboard.map((row, i) => (
            <div
              key={row.user_id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                row.user_id === user.id ? "bg-primary/5" : ""
              }`}
            >
              <span className="w-6 text-center font-extrabold text-ink-soft">
                {["🥇", "🥈", "🥉"][i] ?? i + 1}
              </span>
              <span className="flex-1 font-semibold truncate">
                {row.name}
                {row.user_id === user.id && " (you)"}
              </span>
              <span className="font-bold text-primary-deep">{row.xp} XP</span>
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <Link
          href="/admin"
          className="mt-6 block rounded-2xl bg-ink text-white text-center font-bold py-3.5 active:scale-[0.99] transition"
        >
          🛠 Admin dashboard
        </Link>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-ink-soft">Loading…</p>}>
      <ProfileInner />
    </Suspense>
  );
}
