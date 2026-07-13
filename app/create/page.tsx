"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface SpaceOption {
  space: { id: string; name: string; type: string };
  membership: { role: string };
}
interface SourceOption {
  id: string;
  title: string;
  kind: string;
  source_version_id: string;
}
interface RecipeOption { id: string; title: string; recipe_version_id: string; status: string }
interface StarterOption { id: string; title: string }

export default function CreatePage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [starters, setStarters] = useState<StarterOption[]>([]);
  const [recipeVersionId, setRecipeVersionId] = useState("");
  const [starterId, setStarterId] = useState("onboarding");
  const [title, setTitle] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceKind, setSourceKind] = useState("manual");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadSources = useCallback(async (chosenSpace: string) => {
    if (!chosenSpace) return setSources([]);
    const response = await fetch(`/api/studio/sources?spaceId=${encodeURIComponent(chosenSpace)}`);
    if (!response.ok) return;
    const data = await response.json();
    setSources(data.sources ?? []);
    setSelected([]);
  }, []);

  const loadRecipes = useCallback(async (chosenSpace: string) => {
    if (!chosenSpace) return setRecipes([]);
    const response = await fetch(`/api/studio/recipes?spaceId=${encodeURIComponent(chosenSpace)}`);
    if (!response.ok) return;
    const data = await response.json();
    setRecipes(data.recipes ?? []);
    setStarters(data.starters ?? []);
    setRecipeVersionId("");
  }, []);

  useEffect(() => {
    void fetch("/api/spaces").then(async (response) => {
      if (response.status === 401) return router.push("/login");
      const data = await response.json();
      const available = data.spaces ?? [];
      setSpaces(available);
      const first = available[0]?.space.id ?? "";
      setSpaceId(first);
      await Promise.all([loadSources(first), loadRecipes(first)]);
    });
  }, [loadRecipes, loadSources, router]);

  async function addStarterRecipe() {
    const response = await fetch("/api/studio/recipes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "starter", spaceId, starterId, visibility: "private" }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Could not add starter recipe");
    await loadRecipes(spaceId);
    setRecipeVersionId(data.recipeVersionId);
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/studio/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaceId,
        title: sourceTitle,
        kind: sourceKind,
        content: [{ title: sourceTitle, text: sourceContent }],
        sourceUrl: sourceUrl || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Could not add source");
    setSourceTitle("");
    setSourceContent("");
    setSourceUrl("");
    await loadSources(spaceId);
  }

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/studio/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selected.length ? "sources" : "blank",
          spaceId,
          title,
          sourceVersionIds: selected,
          recipeVersionId: recipeVersionId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not create draft");
      router.push(`/studio/${data.courseId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-wrap flex max-w-4xl flex-col gap-5">
      <header className="order-0 mb-2">
        <h1 className="page-heading">Create a course</h1>
        <p className="mt-1 text-sm text-ink-soft">Start simple. You can refine everything in Studio before publishing.</p>
      </header>

      <section className="panel order-1 space-y-3">
        <label className="block text-sm font-medium">1. Choose a space</label>
        <select value={spaceId} onChange={(event) => { setSpaceId(event.target.value); void Promise.all([loadSources(event.target.value), loadRecipes(event.target.value)]); }} className="field">
          {spaces.map(({ space }) => <option key={space.id} value={space.id}>{space.name} · {space.type}</option>)}
        </select>
      </section>

      <details className="panel order-3">
        <summary className="flex items-center justify-between text-sm font-medium">Add text to the source library <span className="text-xs font-normal text-ink-soft">Optional</span></summary>
      <form onSubmit={addSource} className="mt-4 space-y-3 border-t border-line pt-4">
        <div><h2 className="font-bold">Add a text source</h2><p className="text-xs text-ink-soft">Paste your own material, transcript, notes, or approved webpage text.</p></div>
        <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Source title" className="field" />
        <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)} className="field">
          <option value="manual">Manual notes</option><option value="transcript">Transcript</option><option value="text">Plain text</option><option value="markdown">Markdown</option><option value="webpage">Approved webpage text</option>
        </select>
        {sourceKind === "webpage" && <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Original webpage URL" className="field" />}
        <textarea value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} placeholder="Paste source text" rows={5} className="field" />
        <button disabled={!spaceId || sourceTitle.trim().length < 2 || !sourceContent.trim()} className="btn-teal">Add to source library</button>
      </form>
      </details>

      <details className="panel order-4">
        <summary className="flex items-center justify-between text-sm font-medium">Choose a teaching recipe <span className="text-xs font-normal text-ink-soft">Optional</span></summary>
      <section className="mt-4 space-y-3 border-t border-line pt-4">
        <div><h2 className="font-bold">Teaching recipe</h2><p className="text-xs text-ink-soft">Optional. A recipe controls audience, style, assessment, delivery and accessibility without containing learner data.</p></div>
        <select value={recipeVersionId} onChange={(event) => setRecipeVersionId(event.target.value)} className="field">
          <option value="">No recipe</option>{recipes.map((recipe) => <option key={recipe.recipe_version_id} value={recipe.recipe_version_id}>{recipe.title} · {recipe.status}</option>)}
        </select>
        <div className="flex gap-2"><select value={starterId} onChange={(event) => setStarterId(event.target.value)} className="min-w-0 flex-1 rounded-xl border-2 border-line bg-paper px-3 py-2.5">{starters.map((starter) => <option key={starter.id} value={starter.id}>{starter.title}</option>)}</select><button type="button" onClick={() => void addStarterRecipe()} className="rounded-xl bg-teal text-white font-bold px-4">Add starter</button></div>
      </section>
      </details>

      <form onSubmit={createCourse} className="panel order-2 space-y-3">
        <div><h2 className="font-semibold">2. Name the course and choose material</h2><p className="mt-1 text-sm text-ink-soft">Leave the source list empty for a blank course.</p></div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Course title" className="field" />
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {sources.length === 0 && <p className="text-sm text-ink-soft">No saved sources yet. A blank draft is ready whenever you are.</p>}
          {sources.map((source) => (
            <label key={source.source_version_id} className="flex items-start gap-3 rounded-lg border border-line p-3 hover:bg-hover/30">
              <input type="checkbox" checked={selected.includes(source.source_version_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, source.source_version_id] : current.filter((id) => id !== source.source_version_id))} className="mt-1" />
              <span><span className="block text-sm font-semibold">{source.title}</span><span className="text-xs text-ink-soft capitalize">{source.kind}</span></span>
            </label>
          ))}
        </div>
        <button disabled={busy || !spaceId || title.trim().length < 2} className="w-full rounded-xl bg-primary text-white font-bold py-2.5 disabled:opacity-40">{busy ? "Creating…" : selected.length ? `Create from ${selected.length} source${selected.length === 1 ? "" : "s"}` : "Create blank draft"}</button>
      </form>
      {error && <p className="order-5 text-sm font-semibold text-no">{error}</p>}
    </div>
  );
}
