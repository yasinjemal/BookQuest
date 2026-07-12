"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface SpaceSummary {
  space: { id: string; name: string; type: string; status: string };
  membership: { role: string; status: string };
}

export default function SpacesPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("private");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/spaces");
    if (response.status === 401) return router.push("/login");
    const data = await response.json();
    setSpaces(data.spaces ?? []);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not create Space");
      router.push(`/spaces/${data.space.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-extrabold">Spaces</h1>
      <p className="text-sm text-ink-soft mt-1 mb-5">Your private learning areas, teams, and communities.</p>
      <form onSubmit={create} className="rounded-2xl bg-card border border-line p-4 shadow-sm space-y-3">
        <h2 className="font-bold">Create a Space</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Economics study group" className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5 outline-none focus:border-primary" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5">
          <option value="private">Private — invitation only</option>
          <option value="unlisted">Unlisted — hidden link</option>
          <option value="organization">Organization — managed</option>
          <option value="public">Public — open community</option>
        </select>
        <button disabled={busy || name.trim().length < 2} className="w-full rounded-xl bg-primary text-white font-bold py-2.5 disabled:opacity-40">{busy ? "Creating…" : "Create Space"}</button>
        {error && <p className="text-sm text-no font-medium">{error}</p>}
      </form>
      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">My Spaces</h2>
      <div className="space-y-3">
        {spaces === null && <p className="text-center text-ink-soft py-6">Loading…</p>}
        {spaces?.map(({ space, membership }) => (
          <Link key={space.id} href={`/spaces/${space.id}`} className="block rounded-2xl bg-card border border-line p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="font-bold truncate">{space.name}</h3><p className="text-xs text-ink-soft capitalize">{space.type} · {membership.role}</p></div><span>→</span></div>
          </Link>
        ))}
      </div>
      <Link href="/classes" className="block text-center text-sm text-primary-deep font-semibold mt-6">Open legacy Classes</Link>
    </div>
  );
}
