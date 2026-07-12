"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminData {
  counts: { users: number; courses: number; published: number; revenue_cents: number };
  learningLedger: {
    events: number;
    events_24h: number;
    learners: number;
    question_versions: number;
    malformed: number;
  };
  users: {
    id: number;
    email: string;
    name: string;
    role: string;
    credits: number;
    premium_until: string | null;
    created_at: string;
  }[];
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin");
    if (res.status === 401) return router.push("/login");
    if (res.status === 403) return router.push("/");
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function grant(userId: number) {
    const amount = prompt("Credits to add (negative to remove):", "5");
    if (!amount) return;
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, credits: Number(amount) }),
    });
    load();
  }

  if (!data) return <p className="p-8 text-center text-ink-soft">Loading…</p>;

  const c = data.counts;
  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-extrabold mb-4">Admin</h1>

      <div className="grid grid-cols-2 gap-3">
        {[
          ["👤 Users", c.users],
          ["📚 Courses", c.courses],
          ["🌍 Published", c.published],
          ["💰 Revenue", `$${(c.revenue_cents / 100).toFixed(2)}`],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-card border border-line p-4 text-center shadow-sm"
          >
            <div className="text-xl font-extrabold">{value}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Learning evidence
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Answer events", data.learningLedger.events],
          ["Last 24 hours", data.learningLedger.events_24h],
          ["Learners captured", data.learningLedger.learners],
          ["Question versions", data.learningLedger.question_versions],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-card border border-line p-4 shadow-sm"
          >
            <div className="text-xl font-extrabold">{value ?? 0}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>
      {data.learningLedger.malformed > 0 && (
        <p className="mt-2 text-sm text-no font-semibold">
          {data.learningLedger.malformed} malformed evidence events need attention.
        </p>
      )}

      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Users
      </h2>
      <div className="rounded-2xl bg-card border border-line shadow-sm divide-y divide-line">
        {data.users.map((u) => (
          <div key={u.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">
                {u.name} {u.role === "admin" && "🛠"}
              </div>
              <div className="text-xs text-ink-soft truncate">{u.email}</div>
            </div>
            <span className="text-sm font-bold text-primary-deep">⚡{u.credits}</span>
            <button
              onClick={() => grant(u.id)}
              className="text-xs font-bold border border-line rounded-lg px-2.5 py-1.5"
            >
              +⚡
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
