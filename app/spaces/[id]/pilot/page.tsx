"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type GateType =
  | "manual_process_baseline"
  | "success_criteria"
  | "journey_acceptance"
  | "audit_pack_acceptance"
  | "live_credential_revocation"
  | "identity_provider_test"
  | "penetration_test"
  | "accessibility_audit"
  | "incident_restore_exercise"
  | "marketing_claim_review"
  | "willingness_to_pay";

interface PilotDashboard {
  access: { role: string; canManagePilot: boolean; canRecordObservation: boolean };
  pilot: null | { id: string; status: string; startedAt: string; completedAt: string | null };
  plan?: {
    version: number;
    partnerDisplayName: string;
    sector: string;
    identityProviderRequirement: "undecided" | "password" | "oidc" | "saml";
    scimRequired: boolean;
    baseline: { description: string; uploadToAssignmentMinutes: number; adminHoursPerCohort: number };
    successCriteria: Array<{ metric: string; target: string }>;
  };
  observations?: Array<{ id: string; observation_type: string; observation: { summary: string; manualDatabaseWork: boolean }; occurred_at: string }>;
  attestations?: Array<{ id: string; gate_type: GateType; outcome: string; summary: string; role_snapshot: string; occurred_at: string }>;
  evidenceCandidates?: {
    auditPacks: Array<{ id: string; report_format_version: string; created_at: string }>;
    credentials: Array<{ id: string; display_code: string; status: string; issued_at: string }>;
    identityProviders: Array<{ id: string; protocol: string; status: string; issuer: string }>;
  };
  readiness?: { ready: boolean; missing: string[]; technical: { completedParticipations: number; reconciliationFailures: number } };
}

type IdentityMethod = NonNullable<PilotDashboard["plan"]>["identityProviderRequirement"];

const GATES: Array<{ value: GateType; label: string }> = [
  { value: "manual_process_baseline", label: "Manual process baseline agreed" },
  { value: "success_criteria", label: "Success criteria agreed" },
  { value: "journey_acceptance", label: "Admin and learner journey accepted" },
  { value: "audit_pack_acceptance", label: "Audit pack accepted" },
  { value: "live_credential_revocation", label: "Live credential revocation verified" },
  { value: "identity_provider_test", label: "Pilot sign-in tested" },
  { value: "penetration_test", label: "Independent penetration test" },
  { value: "accessibility_audit", label: "Accessibility audit" },
  { value: "incident_restore_exercise", label: "Incident and restore exercise" },
  { value: "marketing_claim_review", label: "Marketing claims reviewed" },
  { value: "willingness_to_pay", label: "Willingness to pay validated" },
];

const missingLabel = (code: string) => code
  .replace(/^(attestation|observation|evidence|identity_provider):/, "")
  .replaceAll("_", " ");

const signInLabel = (method: IdentityMethod) =>
  method === "password" ? "BookQuest email and password" : method.toUpperCase();

export default function InstitutionalPilotPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PilotDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [sector, setSector] = useState("");
  const [idp, setIdp] = useState<IdentityMethod>("undecided");
  const [scimRequired, setScimRequired] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [baselineMinutes, setBaselineMinutes] = useState("60");
  const [baselineHours, setBaselineHours] = useState("4");
  const [criteria, setCriteria] = useState("Upload to assignment time | Under 30 minutes\nAdministrative time | At least 30% lower");
  const [observationType, setObservationType] = useState("admin_journey");
  const [participantKey, setParticipantKey] = useState("");
  const [observationSummary, setObservationSummary] = useState("");
  const [supportNeeds, setSupportNeeds] = useState("");
  const [minutesSpent, setMinutesSpent] = useState("30");
  const [manualDatabaseWork, setManualDatabaseWork] = useState(false);
  const [gateType, setGateType] = useState<GateType>("manual_process_baseline");
  const [outcome, setOutcome] = useState("accepted");
  const [gateSummary, setGateSummary] = useState("");
  const [evidenceUri, setEvidenceUri] = useState("");
  const [artifactHash, setArtifactHash] = useState("");
  const [openActions, setOpenActions] = useState("");
  const [auditPackId, setAuditPackId] = useState("");
  const [credentialId, setCredentialId] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/spaces/${id}/institutional-pilot`, { cache: "no-store" });
    if (response.status === 401) return router.push("/login");
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Pilot evidence could not be loaded");
      setLoading(false);
      return;
    }
    setDashboard(result.dashboard);
    if (result.dashboard?.plan) {
      const plan = result.dashboard.plan as PilotDashboard["plan"];
      if (plan) {
        setPartnerName(plan.partnerDisplayName);
        setSector(plan.sector);
        setIdp(plan.identityProviderRequirement);
        setScimRequired(plan.scimRequired);
        setBaseline(plan.baseline.description);
        setBaselineMinutes(String(plan.baseline.uploadToAssignmentMinutes));
        setBaselineHours(String(plan.baseline.adminHoursPerCohort));
        setCriteria(plan.successCriteria.map((item) => `${item.metric} | ${item.target}`).join("\n"));
      }
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(body: object) {
    setError("");
    setNotice("");
    const response = await fetch(`/api/spaces/${id}/institutional-pilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      const missing = Array.isArray(result.missing) ? `: ${result.missing.map(missingLabel).join(", ")}` : "";
      throw new Error(`${result.error ?? "Pilot action failed"}${missing}`);
    }
    return result;
  }

  function planBody() {
    const successCriteria = criteria.split("\n").map((line) => {
      const [metric, ...target] = line.split("|");
      return { metric: metric.trim(), target: target.join("|").trim() };
    }).filter((item) => item.metric || item.target);
    return {
      partnerDisplayName: partnerName,
      sector,
      identityProviderRequirement: idp,
      scimRequired,
      baseline: {
        description: baseline,
        uploadToAssignmentMinutes: Number(baselineMinutes),
        adminHoursPerCohort: Number(baselineHours),
      },
      successCriteria,
    };
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    try {
      const action = dashboard?.pilot ? "revise" : "create";
      await mutate({ action, plan: planBody() });
      setNotice(action === "create" ? "Pilot evidence record started." : "A new immutable pilot plan version was saved.");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function observe(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate({ action: "observe", observation: {
        observationType,
        participantKey,
        summary: observationSummary,
        supportNeeds: supportNeeds.split("\n").map((item) => item.trim()).filter(Boolean),
        minutesSpent: Number(minutesSpent),
        manualDatabaseWork,
      } });
      setParticipantKey("");
      setObservationSummary("");
      setSupportNeeds("");
      setNotice("Observation recorded without storing the participant's name or email.");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function attest(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate({ action: "attest", attestation: {
        gateType,
        outcome,
        summary: gateSummary,
        evidenceUri: evidenceUri || null,
        artifactHash: artifactHash || null,
        openActions: openActions.split("\n").map((item) => item.trim()).filter(Boolean),
        auditPackId: gateType === "audit_pack_acceptance" ? auditPackId || null : null,
        credentialId: gateType === "live_credential_revocation" ? credentialId || null : null,
      } });
      setGateSummary("");
      setEvidenceUri("");
      setArtifactHash("");
      setOpenActions("");
      setNotice("Gate decision recorded immutably with your current role.");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function complete() {
    try {
      await mutate({ action: "complete" });
      setNotice("The governed pilot record is complete.");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  if (loading) return <main className="mx-auto max-w-3xl p-5"><p>Loading pilot evidence…</p></main>;
  if (!dashboard) return <main className="mx-auto max-w-3xl p-5"><p role="alert">{error || "Pilot evidence is unavailable."}</p></main>;

  const canManage = dashboard.access.canManagePilot;
  const canObserve = dashboard.access.canRecordObservation;
  const active = dashboard.pilot?.status === "active";

  return <main className="mx-auto max-w-3xl px-5 py-8 space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-primary">Institutional pilot</p><h1 className="text-2xl font-extrabold">Governed pilot evidence</h1></div>
      <Link href={`/spaces/${id}`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">Back to Space</Link>
    </div>
    <p className="text-sm leading-6 text-ink-soft">This record does not manufacture acceptance. It binds named account decisions to actual assignment, credential and audit evidence, and refuses closure while required proof is missing.</p>

    {dashboard.pilot && dashboard.plan && <section className="rounded-2xl border border-line bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">{dashboard.plan.partnerDisplayName}</h2><p className="text-xs text-ink-soft">{dashboard.plan.sector} · plan version {dashboard.plan.version}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">{dashboard.pilot.status}</span></div>
      <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-paper p-3"><p className="text-xs text-ink-soft">Sign-in method</p><p className="font-semibold">{signInLabel(dashboard.plan.identityProviderRequirement)}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-xs text-ink-soft">Completed journeys</p><p className="font-semibold">{dashboard.readiness?.technical.completedParticipations ?? 0}</p></div></div>
      <div><h3 className="text-sm font-bold">Release readiness</h3>{dashboard.readiness?.ready ? <p className="mt-1 text-sm font-semibold text-go">Every governed gate has evidence.</p> : <ul className="mt-2 grid gap-1 text-sm text-ink-soft">{dashboard.readiness?.missing.map((item) => <li key={item} className="rounded-lg bg-paper px-3 py-2">Open: {missingLabel(item)}</li>)}</ul>}</div>
      {dashboard.evidenceCandidates?.identityProviders.length === 0 && ["oidc", "saml"].includes(dashboard.plan.identityProviderRequirement) && <p className="rounded-xl border border-no/30 bg-no/5 p-3 text-sm text-no">The selected {dashboard.plan.identityProviderRequirement.toUpperCase()} connection has not been activated and tested.</p>}
    </section>}

    {canManage && (!dashboard.pilot || active) && <form onSubmit={savePlan} className="rounded-2xl border border-line bg-card p-4 space-y-3">
      <h2 className="font-bold">{dashboard.pilot ? "Revise pilot plan" : "Start pilot record"}</h2>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-ink-soft">Partner display name<input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} className="mt-1 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" /></label><label className="text-xs text-ink-soft">Sector<input value={sector} onChange={(event) => setSector(event.target.value)} className="mt-1 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" /></label></div>
      <label className="block text-xs text-ink-soft">Current manual process<textarea value={baseline} onChange={(event) => setBaseline(event.target.value)} rows={4} className="mt-1 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" /></label>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-ink-soft">Upload-to-assignment minutes<input type="number" min="1" value={baselineMinutes} onChange={(event) => setBaselineMinutes(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-paper p-2 text-sm" /></label><label className="text-xs text-ink-soft">Admin hours per cohort<input type="number" min="0" step="0.25" value={baselineHours} onChange={(event) => setBaselineHours(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-paper p-2 text-sm" /></label></div>
      <label className="block text-xs text-ink-soft">Agreed criteria, one “metric | target” per line<textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} rows={4} className="mt-1 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" /></label>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-ink-soft">Pilot sign-in method<select value={idp} onChange={(event) => { const method = event.target.value as IdentityMethod; setIdp(method); if (method === "password") setScimRequired(false); }} className="mt-1 w-full rounded-xl border border-line bg-paper p-2 text-sm"><option value="undecided">Not selected</option><option value="password">BookQuest email and password</option><option value="oidc">Organization OIDC</option><option value="saml">Organization SAML</option></select></label><label className="flex items-end gap-2 rounded-xl border border-line bg-paper p-3 text-sm"><input type="checkbox" checked={scimRequired} onChange={(event) => setScimRequired(event.target.checked)} disabled={idp === "password"} /> SCIM volume justifies provisioning</label></div>
      <button className="w-full rounded-xl bg-primary py-2.5 font-bold text-white">{dashboard.pilot ? "Save new plan version" : "Start governed pilot"}</button>
    </form>}

    {active && canObserve && <form onSubmit={observe} className="rounded-2xl border border-line bg-card p-4 space-y-3">
      <h2 className="font-bold">Record an observed journey</h2>
      <div className="grid gap-2 sm:grid-cols-2"><select value={observationType} onChange={(event) => setObservationType(event.target.value)} className="rounded-xl border border-line bg-paper p-2.5 text-sm"><option value="admin_journey">Administrator journey</option><option value="learner_journey">Learner journey</option><option value="support">Support need</option><option value="commercial">Commercial discussion</option><option value="incident">Incident exercise</option></select><input value={participantKey} onChange={(event) => setParticipantKey(event.target.value)} placeholder="Opaque code, e.g. admin-01" className="rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" /></div>
      <textarea value={observationSummary} onChange={(event) => setObservationSummary(event.target.value)} placeholder="What was observed?" rows={3} className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" />
      <textarea value={supportNeeds} onChange={(event) => setSupportNeeds(event.target.value)} placeholder="Support needs, one per line" rows={2} className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-3"><label className="text-xs text-ink-soft">Minutes<input type="number" min="0" value={minutesSpent} onChange={(event) => setMinutesSpent(event.target.value)} className="ml-2 w-24 rounded-lg border border-line bg-paper p-2" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manualDatabaseWork} onChange={(event) => setManualDatabaseWork(event.target.checked)} /> Required manual database work</label></div>
      <button className="w-full rounded-xl border border-primary py-2.5 font-bold text-primary">Append observation</button>
    </form>}

    {active && canManage && <form onSubmit={attest} className="rounded-2xl border border-line bg-card p-4 space-y-3">
      <h2 className="font-bold">Record a gate decision</h2>
      <div className="grid gap-2 sm:grid-cols-2"><select value={gateType} onChange={(event) => setGateType(event.target.value as GateType)} className="rounded-xl border border-line bg-paper p-2.5 text-sm">{GATES.map((gate) => <option key={gate.value} value={gate.value}>{gate.label}</option>)}</select><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="rounded-xl border border-line bg-paper p-2.5 text-sm"><option value="accepted">Accepted</option><option value="accepted_with_actions">Accepted with transparent actions</option><option value="rejected">Rejected</option></select></div>
      <textarea value={gateSummary} onChange={(event) => setGateSummary(event.target.value)} placeholder="Decision, responsible stakeholder and stated purpose" rows={3} className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" />
      {gateType === "audit_pack_acceptance" && <select value={auditPackId} onChange={(event) => setAuditPackId(event.target.value)} className="w-full rounded-xl border border-line bg-paper p-2.5 text-sm"><option value="">Select the accepted audit pack</option>{dashboard.evidenceCandidates?.auditPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.report_format_version} · {new Date(pack.created_at).toLocaleString()}</option>)}</select>}
      {gateType === "live_credential_revocation" && <select value={credentialId} onChange={(event) => setCredentialId(event.target.value)} className="w-full rounded-xl border border-line bg-paper p-2.5 text-sm"><option value="">Select the tested credential</option>{dashboard.evidenceCandidates?.credentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.display_code} · {credential.status}</option>)}</select>}
      <div className="grid gap-2 sm:grid-cols-2"><input value={evidenceUri} onChange={(event) => setEvidenceUri(event.target.value)} placeholder="HTTPS evidence link" className="rounded-xl border border-line bg-paper px-3 py-2 text-sm" /><input value={artifactHash} onChange={(event) => setArtifactHash(event.target.value)} placeholder="SHA-256 artifact hash" className="rounded-xl border border-line bg-paper px-3 py-2 text-sm" /></div>
      {outcome === "accepted_with_actions" && <textarea value={openActions} onChange={(event) => setOpenActions(event.target.value)} placeholder="Open remediation actions, one per line" rows={2} className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm" />}
      <button className="w-full rounded-xl bg-ink py-2.5 font-bold text-white">Append signed decision</button>
    </form>}

    {dashboard.observations && dashboard.observations.length > 0 && <section><h2 className="mb-2 font-bold">Latest observations</h2><div className="space-y-2">{dashboard.observations.slice(0, 6).map((item) => <div key={item.id} className="rounded-xl border border-line bg-card p-3"><p className="text-xs font-bold uppercase text-primary">{missingLabel(item.observation_type)}</p><p className="mt-1 text-sm">{item.observation.summary}</p><p className="mt-1 text-xs text-ink-soft">{new Date(item.occurred_at).toLocaleString()} · manual database work: {item.observation.manualDatabaseWork ? "yes" : "no"}</p></div>)}</div></section>}
    {dashboard.attestations && dashboard.attestations.length > 0 && <section><h2 className="mb-2 font-bold">Latest gate decisions</h2><div className="space-y-2">{dashboard.attestations.slice(0, 8).map((item) => <div key={item.id} className="rounded-xl border border-line bg-card p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase text-primary">{missingLabel(item.gate_type)}</p><span className="text-xs font-semibold">{item.outcome.replaceAll("_", " ")}</span></div><p className="mt-1 text-sm">{item.summary}</p><p className="mt-1 text-xs text-ink-soft">Signed as {item.role_snapshot} · {new Date(item.occurred_at).toLocaleString()}</p></div>)}</div></section>}

    {active && canManage && <button onClick={() => void complete()} disabled={!dashboard.readiness?.ready} className="w-full rounded-xl bg-go py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Complete pilot only when every gate passes</button>}
    {notice && <p className="rounded-xl bg-go/10 p-3 text-sm font-semibold text-go">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-no/10 p-3 text-sm font-semibold text-no">{error}</p>}
  </main>;
}
