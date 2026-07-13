"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseWorld from "@/components/CourseWorld";
import SpacePlaceCard from "@/components/SpacePlaceCard";

interface SpaceSummary { space: { id: string; name: string; type: string; status: string }; membership: { role: string; status: string } }

const typeDescription: Record<string, string> = {
  private: "A private place for a small invited group.",
  unlisted: "A quiet place people enter through a private link.",
  organization: "A governed place with roles, assignments, policy, and audit evidence.",
  public: "An open learning community people can discover.",
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
    if (!response.ok) return setError("Your Spaces could not be opened.");
    const data = await response.json();
    setSpaces(data.spaces ?? []);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/spaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type }) });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not create Space");
      router.push(`/spaces/${data.space.id}`);
    } finally { setBusy(false); }
  }

  return <div className="page-wrap"><div className="content-measure">
    <header className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[.9fr_1.1fr]">
      <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Spaces</p><h1 className="display mt-3 text-[clamp(3.2rem,11vw,6rem)] leading-[0.88]">Every community needs a place of its own.</h1><p className="mt-5 max-w-xl text-sm leading-6 text-white/70">Personal study, private groups, classrooms, organisations, and public communities—each with clear roles and boundaries.</p><button type="button" onClick={() => setShowCreate((open) => !open)} aria-expanded={showCreate} className={`mt-7 inline-flex min-h-12 w-fit items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold ${showCreate ? "border border-white/20 text-white" : "bg-signal text-ink"}`}>{showCreate ? "Close" : "Create a Space"}<AppIcon name={showCreate ? "spaces" : "arrow"} className="h-4 w-4" /></button></div>
      <CourseWorld seed="shared-places" theme="village" progress={48} className="min-h-64 lg:min-h-[29rem]" />
    </header>

    {showCreate && <form onSubmit={create} className="mx-auto mt-6 max-w-3xl space-y-6 rounded-[1.6rem] border border-line bg-card p-6 shadow-pop sm:p-8"><div><p className="section-label">A new place</p><h2 className="display mt-2 text-4xl">Create a Space</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Choose the simplest access model that fits how people will join.</p></div><label className="block text-sm font-semibold">Space name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="A name people will recognise" className="field mt-2" /></label><fieldset><legend className="text-sm font-semibold">Space type</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(typeDescription).map(([value, description]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${type === value ? "border-ink bg-ink text-white" : "border-line bg-ivory"}`}><input type="radio" name="space-type" value={value} checked={type === value} onChange={(event) => setType(event.target.value)} className="mt-1" /><span><strong className="block text-sm capitalize">{value === "unlisted" ? "Invite by link" : value}</strong><span className={`mt-1 block text-xs leading-5 ${type === value ? "text-white/65" : "text-ink-soft"}`}>{description}</span></span></label>)}</div></fieldset><div className="flex justify-end"><button disabled={busy || name.trim().length < 2} className="btn-primary">{busy ? "Creating…" : "Create this Space"}<AppIcon name="arrow" className="h-4 w-4" /></button></div></form>}

    {error && <p role="alert" className="mt-6 rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{error}</p>}
    <section className="mt-14" aria-labelledby="your-spaces-heading"><div className="mb-5"><p className="section-label">Your places</p><h2 id="your-spaces-heading" className="display mt-2 text-4xl">Communities you belong to</h2></div>{spaces === null && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-[23rem] rounded-[1.45rem] skeleton" />)}</div>}{spaces?.length === 0 && <div className="rounded-[1.5rem] border border-line bg-card px-6 py-14 text-center shadow-card"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="spaces" className="h-5 w-5" /></span><h3 className="display mt-5 text-3xl">No shared places yet.</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">Your personal study Space is created automatically when available.</p></div>}<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{spaces?.map(({ space, membership }) => <SpacePlaceCard key={space.id} space={space} membership={membership} />)}</div></section>
    <Link href="/classes" className="mt-10 inline-flex min-h-11 items-center text-sm font-semibold text-ink-soft underline decoration-line-deep underline-offset-4 hover:text-ink">Open legacy classes</Link>
  </div></div>;
}
