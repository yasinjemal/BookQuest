"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type IntegrationData = {
  apiVersion: string;
  scopes: string[];
  webhookEventTypes: string[];
  clients: Array<{ id: string; clientId: string; name: string; scopes: string[]; status: string; createdAt: string }>;
  endpoints: Array<{ id: string; url: string; eventTypes: string[]; status: string; createdAt: string }>;
};
type LtiData = {
  courses: Array<{ id: number; title: string; content_version: number }>;
  registrations: Array<{
    id: string; courseId: number; issuer: string; clientId: string; deploymentId: string;
    authorizationEndpoint: string; tokenEndpoint: string; jwksUrl: string; status: string;
  }>;
};

export default function SpaceIntegrationsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<IntegrationData | null>(null);
  const [lti, setLti] = useState<LtiData | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientScopes, setClientScopes] = useState<string[]>(["courses.read"]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [eventTypes, setEventTypes] = useState<string[]>(["course.published"]);
  const [ltiForm, setLtiForm] = useState({ courseId: "", issuer: "", clientId: "", deploymentId: "", authorizationEndpoint: "", tokenEndpoint: "", jwksUrl: "" });
  const [oneTimeSecret, setOneTimeSecret] = useState<{ title: string; values: string[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [response, ltiResponse] = await Promise.all([
      fetch(`/api/spaces/${id}/integrations`, { cache: "no-store" }),
      fetch(`/api/spaces/${id}/lti`, { cache: "no-store" }),
    ]);
    if (response.status === 401) return router.push(`/login?next=/spaces/${id}/integrations`);
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not open integrations");
    setData(result);
    if (ltiResponse.ok) {
      const ltiResult = await ltiResponse.json(); setLti(ltiResult);
      setLtiForm((current) => ({ ...current, courseId: current.courseId || String(ltiResult.courses[0]?.id ?? "") }));
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true); setError("");
    const response = await fetch(`/api/spaces/${id}/integrations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json(); setBusy(false);
    if (!response.ok) throw new Error(result.error ?? "Integration action failed");
    return result;
  }

  async function createClient(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await mutate({ action: "create_client", name: clientName, scopes: clientScopes });
      setOneTimeSecret({ title: "Save these client credentials now", values: [result.client.clientId, result.client.clientSecret] });
      setClientName(""); await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function createWebhook(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await mutate({ action: "create_webhook", url: webhookUrl, eventTypes });
      setOneTimeSecret({ title: "Save this webhook signing secret now", values: [result.endpoint.signingSecret] });
      setWebhookUrl(""); await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function revoke(kind: "client" | "webhook", resourceId: string) {
    if (!window.confirm(`Revoke this ${kind}? This cannot be undone.`)) return;
    try {
      await mutate(kind === "client"
        ? { action: "revoke_client", clientId: resourceId }
        : { action: "revoke_webhook", endpointId: resourceId });
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function createLti(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch(`/api/spaces/${id}/lti`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...ltiForm, courseId: Number(ltiForm.courseId) }),
    });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(result.error ?? "Could not create LTI registration");
    setLtiForm((current) => ({ ...current, issuer: "", clientId: "", deploymentId: "", authorizationEndpoint: "", tokenEndpoint: "", jwksUrl: "" }));
    await load();
  }

  async function revokeLti(registrationId: string) {
    if (!window.confirm("Revoke this LTI deployment? Existing LMS launches will stop immediately.")) return;
    const response = await fetch(`/api/spaces/${id}/lti`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", registrationId }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not revoke LTI registration");
    await load();
  }

  if (!data) return <main className="page-wrap"><div className="mx-auto max-w-5xl panel">{error || "Opening integrations…"}</div></main>;
  return <main className="page-wrap pb-28"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href={`/spaces/${id}`} className="text-sm font-semibold text-ink-soft">← Back to Space</Link><p className="section-label mt-5">Developer settings</p><h1 className="display mt-1 text-4xl sm:text-5xl">Integrations, without mystery.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">Create least-privilege machine access and signed webhooks. Secrets appear once; revocation is permanent.</p></div>
      <span className="rounded-full bg-paper px-3 py-2 text-xs font-bold">API {data.apiVersion}</span>
    </header>
    {error && <div role="alert" className="rounded-2xl border border-no/30 bg-no-soft p-4 text-sm font-semibold text-no">{error}</div>}
    {oneTimeSecret && <section className="rounded-3xl border border-amber/40 bg-ivory p-5 shadow-card"><p className="section-label">Shown once</p><h2 className="mt-1 text-xl font-bold">{oneTimeSecret.title}</h2><p className="mt-2 text-sm text-ink-soft">BookQuest cannot show these values again. Store them in your secret manager, then close this panel.</p><div className="mt-4 space-y-2">{oneTimeSecret.values.map((value) => <code key={value} className="block overflow-x-auto rounded-xl bg-ink p-3 text-xs text-white">{value}</code>)}</div><button onClick={() => setOneTimeSecret(null)} className="quiet-button mt-4">I saved them</button></section>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel"><p className="section-label">OAuth 2.0</p><h2 className="display mt-1 text-3xl">Machine clients</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Client credentials issue one-hour opaque bearer tokens. Choose only the data each system needs.</p>
        <form onSubmit={createClient} className="mt-5 space-y-3"><label className="text-xs font-bold">Client name<input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Reporting connector" className="mt-1 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm" /></label><fieldset><legend className="text-xs font-bold">Scopes</legend><div className="mt-2 flex flex-wrap gap-2">{data.scopes.map((scope) => <label key={scope} className="rounded-full border border-line px-3 py-2 text-xs"><input type="checkbox" checked={clientScopes.includes(scope)} onChange={(event) => setClientScopes(event.target.checked ? [...clientScopes, scope] : clientScopes.filter((item) => item !== scope))} className="mr-2" />{scope}</label>)}</div></fieldset><button disabled={busy || clientName.trim().length < 2 || !clientScopes.length} className="btn-primary w-full disabled:opacity-40">Create client</button></form>
        <div className="mt-6 space-y-3">{data.clients.map((client) => <article key={client.id} className="rounded-2xl border border-line p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{client.name}</h3><code className="mt-1 block break-all text-[11px] text-ink-soft">{client.clientId}</code><p className="mt-2 text-xs text-ink-soft">{client.scopes.join(" · ")}</p></div><span className="rounded-full bg-paper px-2 py-1 text-[10px] font-bold uppercase">{client.status}</span></div>{client.status === "active" && <button onClick={() => void revoke("client", client.id)} className="mt-3 text-xs font-bold text-no">Revoke client</button>}</article>)}</div>
      </section>
      <section className="panel"><p className="section-label">Outbound events</p><h2 className="display mt-1 text-3xl">Signed webhooks</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Every delivery has a stable event ID, idempotency key and timestamped HMAC-SHA256 signature.</p>
        <form onSubmit={createWebhook} className="mt-5 space-y-3"><label className="text-xs font-bold">HTTPS endpoint<input type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://example.com/bookquest/events" className="mt-1 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm" /></label><fieldset><legend className="text-xs font-bold">Events</legend><div className="mt-2 grid gap-2">{data.webhookEventTypes.map((type) => <label key={type} className="rounded-xl border border-line p-3 text-xs"><input type="checkbox" checked={eventTypes.includes(type)} onChange={(event) => setEventTypes(event.target.checked ? [...eventTypes, type] : eventTypes.filter((item) => item !== type))} className="mr-2" />{type}</label>)}</div></fieldset><button disabled={busy || !webhookUrl || !eventTypes.length} className="btn-primary w-full disabled:opacity-40">Add endpoint</button></form>
        <div className="mt-6 space-y-3">{data.endpoints.map((endpoint) => <article key={endpoint.id} className="rounded-2xl border border-line p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{endpoint.url}</p><p className="mt-2 text-xs text-ink-soft">{endpoint.eventTypes.join(" · ")}</p></div><span className="rounded-full bg-paper px-2 py-1 text-[10px] font-bold uppercase">{endpoint.status}</span></div>{endpoint.status === "active" && <button onClick={() => void revoke("webhook", endpoint.id)} className="mt-3 text-xs font-bold text-no">Revoke endpoint</button>}</article>)}</div>
      </section>
    </div>
    <section className="panel"><p className="section-label">Quick start</p><h2 className="mt-1 text-xl font-bold">Token and API endpoints</h2><div className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><code className="rounded-xl bg-paper p-3">POST /api/oauth/token</code><code className="rounded-xl bg-paper p-3">GET /api/v1/spaces/{id}/courses</code><code className="rounded-xl bg-paper p-3">GET /api/v1/spaces/{id}/assignments</code></div></section>
    {lti && <section className="panel"><p className="section-label">LMS launch foundation</p><h2 className="display mt-1 text-3xl">LTI 1.3 deployments</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">Register one LMS deployment against one attached course. BookQuest validates OIDC state, nonce, issuer, audience, deployment, RS256 signature and the exact resource-link launch before asking the learner to link an existing Space account.</p>
      <form onSubmit={createLti} className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold">Course<select value={ltiForm.courseId} onChange={(event) => setLtiForm({ ...ltiForm, courseId: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm">{lti.courses.map((course) => <option key={course.id} value={course.id}>{course.title} · v{course.content_version}</option>)}</select></label>{([
        ["issuer", "Platform issuer", "https://lms.example.com"],
        ["clientId", "Client ID", "BookQuest client ID from the LMS"],
        ["deploymentId", "Deployment ID", "LMS deployment ID"],
        ["authorizationEndpoint", "OIDC authorization endpoint", "https://lms.example.com/oidc/auth"],
        ["tokenEndpoint", "OAuth token endpoint", "https://lms.example.com/oauth/token"],
        ["jwksUrl", "Platform JWKS URL", "https://lms.example.com/.well-known/jwks.json"],
      ] as const).map(([key, label, placeholder]) => <label key={key} className="text-xs font-bold">{label}<input value={ltiForm[key]} onChange={(event) => setLtiForm({ ...ltiForm, [key]: event.target.value })} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm" /></label>)}<button disabled={busy || !ltiForm.courseId || Object.entries(ltiForm).some(([key, value]) => key !== "courseId" && !value)} className="btn-primary md:col-span-2 disabled:opacity-40">Register LMS deployment</button></form>
      <div className="mt-6 grid gap-3">{lti.registrations.map((registration) => <article key={registration.id} className="rounded-2xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{registration.issuer}</h3><p className="mt-1 text-xs text-ink-soft">Client {registration.clientId} · deployment {registration.deploymentId} · course {registration.courseId}</p></div><span className="rounded-full bg-paper px-2 py-1 text-[10px] font-bold uppercase">{registration.status}</span></div>{registration.status === "active" && <button onClick={() => void revokeLti(registration.id)} className="mt-3 text-xs font-bold text-no">Revoke deployment</button>}</article>)}</div>
      <p className="mt-5 rounded-xl bg-ivory p-4 text-xs leading-5 text-ink-soft">Assignment and Grade Services scope/line-item claims are validated and retained for the pilot boundary, but grade passback remains disabled until a named LMS pilot supplies endpoints and acceptance evidence.</p>
    </section>}
  </div></main>;
}
