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
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="page-heading">Spaces</h1><p className="mt-1 text-sm text-ink-soft">Keep courses, people, and evidence together.</p></div>
      <button type="button" onClick={() => setShowCreate((open) => !open)} className={showCreate ? "quiet-button" : "btn-primary"}>{showCreate ? "Cancel" : "New space"}</button>
    </header>

    {showCreate && <form onSubmit={create} className="panel mb-8 max-w-2xl space-y-4">
      <div><h2 className="font-semibold">Create a space</h2><p className="mt-1 text-sm text-ink-soft">Choose the simplest type that fits how people will join.</p></div>
      <label className="block text-sm font-medium">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Blacksteel Clothing" className="field mt-1.5" /></label>
      <label className="block text-sm font-medium">Type<select value={type} onChange={(event) => setType(event.target.value)} className="field mt-1.5"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="organization">Organization</option><option value="public">Public</option></select></label>
      <p className="rounded-lg bg-hover/50 px-3 py-2 text-sm text-ink-soft">{typeDescription[type]}</p>
      <div className="flex justify-end"><button disabled={busy || name.trim().length < 2} className="btn-primary">{busy ? "Creating..." : "Create space"}</button></div>
      {error && <p role="alert" className="text-sm font-medium text-no">{error}</p>}
    </form>}

    <section>
      <h2 className="section-label mb-3">Your spaces</h2>
      {spaces === null && <div className="panel text-sm text-ink-soft">Loading spaces...</div>}
      {spaces?.length === 0 && <div className="panel py-10 text-center"><p className="font-medium">No spaces yet</p><p className="mt-1 text-sm text-ink-soft">Create one when you need to organize courses or invite people.</p></div>}
      <div className="grid gap-3 md:grid-cols-2">
        {spaces?.map(({ space, membership }) => <Link key={space.id} href={`/spaces/${space.id}`} className="group panel flex items-center gap-4 transition-colors hover:bg-hover/30">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-hover text-sm font-semibold">{space.name.slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><h3 className="truncate font-medium">{space.name}</h3><p className="mt-0.5 text-xs capitalize text-ink-soft">{space.type} · {membership.role}</p></div>
          <span className="text-ink-soft transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
        </Link>)}
      </div>
    </section>

    <Link href="/classes" className="mt-8 inline-block text-sm text-ink-soft underline decoration-line-deep underline-offset-4 hover:text-ink">Legacy classes</Link>
  </div>;
}
