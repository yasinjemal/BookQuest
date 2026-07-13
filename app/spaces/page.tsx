"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface SpaceSummary {
  space: { id: string; name: string; type: string; status: string };
  membership: { role: string; status: string };
}

const typeDescription: Record<string, string> = {
  private: "A private workspace for your own material or a small invited group.",
  unlisted: "A hidden workspace that people join through a private link.",
  organization: "A managed workspace with roles, assignments, and audit evidence.",
  public: "An open learning community anyone can discover.",
};

export default function SpacesPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
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

  return <div className="page-wrap">
    <header className="premium-panel mb-10 flex min-h-64 flex-wrap items-end justify-between gap-8 p-7 sm:p-10">
      <div className="relative z-10 max-w-xl"><p className="section-label mb-4 text-signal">Shared knowledge</p><h1 className="display text-6xl leading-[0.9] text-white sm:text-7xl">Spaces that keep everything together.</h1><p className="mt-5 text-sm text-white/45">Courses, people, decisions, and evidence—beautifully organized.</p></div>
      <button type="button" onClick={() => setShowCreate((open) => !open)} className={`relative z-10 ${showCreate ? "inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10" : "inline-flex rounded-full bg-signal px-5 py-3 text-sm font-bold text-ink"}`}>{showCreate ? "Cancel" : "New space ↗"}</button>
    </header>

    {showCreate && <form onSubmit={create} className="mb-10 max-w-2xl space-y-4 rounded-[1.75rem] bg-signal p-6 shadow-card sm:p-8">
      <div><p className="section-label mb-2 text-ink/50">A new home</p><h2 className="display text-4xl">Create a space</h2><p className="mt-2 text-sm text-ink/65">Choose the simplest type that fits how people will join.</p></div>
      <label className="block text-sm font-medium">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Blacksteel Clothing" className="field mt-1.5" /></label>
      <label className="block text-sm font-medium">Type<select value={type} onChange={(event) => setType(event.target.value)} className="field mt-1.5"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="organization">Organization</option><option value="public">Public</option></select></label>
      <p className="rounded-xl bg-ink/7 px-4 py-3 text-sm text-ink/65">{typeDescription[type]}</p>
      <div className="flex justify-end"><button disabled={busy || name.trim().length < 2} className="btn-primary">{busy ? "Creating..." : "Create space"}</button></div>
      {error && <p role="alert" className="text-sm font-medium text-no">{error}</p>}
    </form>}

    <section>
      <h2 className="section-label mb-4">Your spaces</h2>
      {spaces === null && <div className="panel text-sm text-ink-soft">Loading spaces...</div>}
      {spaces?.length === 0 && <div className="panel py-10 text-center"><p className="font-medium">No spaces yet</p><p className="mt-1 text-sm text-ink-soft">Create one when you need to organize courses or invite people.</p></div>}
      <div className="grid gap-4 md:grid-cols-2">
        {spaces?.map(({ space, membership }) => <Link key={space.id} href={`/spaces/${space.id}`} className="group paper-card flex min-h-36 items-center gap-4 p-5 transition-all hover:-translate-y-1 hover:shadow-pop sm:p-6">
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-2xl ${space.type === "organization" ? "bg-signal text-ink" : space.type === "public" ? "bg-sky text-ink" : "bg-ink text-white"}`}>{space.name.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><h3 className="display truncate text-2xl">{space.name}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-soft">{space.type} · {membership.role}</p></div>
          <span className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-soft transition-all group-hover:border-ink group-hover:bg-ink group-hover:text-white" aria-hidden="true">↗</span>
        </Link>)}
      </div>
    </section>

    <Link href="/classes" className="mt-8 inline-block text-sm text-ink-soft underline decoration-line-deep underline-offset-4 hover:text-ink">Legacy classes</Link>
  </div>;
}
