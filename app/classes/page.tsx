"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ClassSummary {
  id: number;
  name: string;
  code: string;
  member_count: number;
  is_owner: number;
}

export default function ClassesPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/classes");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setClasses(data.classes);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(body: { name?: string; code?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setName("");
      setCode("");
      router.push(`/class/${data.classroom.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-wrap max-w-4xl">
      <h1 className="text-2xl font-extrabold mb-1">Classes</h1>
      <p className="text-sm text-ink-soft mb-5">
        For schools, study groups and workplace training.
      </p>

      {/* Join */}
      <div className="rounded-2xl bg-card border border-line p-4 shadow-card">
        <h2 className="font-bold text-sm mb-2">Join a class</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) submit({ code });
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Class code e.g. K7M2QX"
            maxLength={6}
            className="flex-1 min-w-0 rounded-xl border-2 border-line bg-paper px-4 py-2.5 font-bold tracking-widest uppercase outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="rounded-xl bg-primary text-white font-bold px-4 disabled:opacity-40"
          >
            Join
          </button>
        </form>
      </div>

      {/* Create */}
      <div className="rounded-2xl bg-card border border-line p-4 shadow-card mt-3">
        <h2 className="font-bold text-sm mb-2">
          Create a class <span className="text-ink-soft font-normal">(you become the teacher)</span>
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) submit({ name });
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grade 11 Economics"
            className="flex-1 min-w-0 rounded-xl border-2 border-line bg-paper px-4 py-2.5 font-medium outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-xl bg-teal text-white font-bold px-4 disabled:opacity-40"
          >
            Create
          </button>
        </form>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-no">{error}</p>}

      {/* My classes */}
      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        My classes
      </h2>
      <div className="space-y-3">
        {classes === null && (
          <p className="text-center text-ink-soft text-sm py-6">Loading…</p>
        )}
        {classes?.length === 0 && (
          <p className="text-center text-ink-soft text-sm py-6">
            No classes yet. Teachers create one; learners join with a code.
          </p>
        )}
        {classes?.map((c) => (
          <Link
            key={c.id}
            href={`/class/${c.id}`}
            className="block rounded-2xl bg-card border border-line p-4 shadow-card active:scale-[0.99] transition"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-bold leading-snug">
                  {c.is_owner ? "🧑‍🏫 " : ""}
                  {c.name}
                </h3>
                <p className="text-xs text-ink-soft">
                  {c.member_count} member{c.member_count === 1 ? "" : "s"}
                  {!!c.is_owner && ` · code ${c.code}`}
                </p>
              </div>
              <span className="text-ink-soft">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
