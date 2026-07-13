"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface Dashboard {
  space: {
    id: string;
    name: string;
    description: string;
    type: string;
    status: string;
    branding_json: string;
  };
  membership: { role: string };
  members: Array<{
    id: string;
    user_id: number;
    name: string;
    role: string;
    status: string;
  }> | null;
  courses: Array<{ id: number; title: string; status: string }>;
  assignments: Array<{
    id: string;
    course_id: number;
    status: string;
    due_at: string | null;
  }>;
  teams: Array<{
    id: string;
    name: string;
    status: string;
    member_count: number;
  }>;
}
interface OwnedCourse {
  id: number;
  title: string;
  status: string;
}
interface InstitutionalDashboard {
  role: string;
  summary: {
    assignments: number;
    participation_attempts: number;
    completed: number;
    in_progress: number;
    overdue: number;
    active_credentials: number;
    revoked_credentials: number;
    pending_practical_reviews: number;
  };
  assignments: Array<{ id: string; course_title: string; assignment_version_id: string; version: number; due_at: string | null; attempts: number; completed: number; open: number }>;
}

export default function SpacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<"overview" | "people" | "settings">("overview");
  const [data, setData] = useState<Dashboard | null>(null);
  const [owned, setOwned] = useState<OwnedCourse[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("learner");
  const [courseId, setCourseId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [institutional, setInstitutional] =
    useState<InstitutionalDashboard | null>(null);
  const [minimumScore, setMinimumScore] = useState("80");
  const [startAt, setStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [audienceType, setAudienceType] = useState<
    "space" | "team" | "membership"
  >("space");
  const [audienceId, setAudienceId] = useState("");
  const [attestationIds, setAttestationIds] = useState("");
  const [practicalIds, setPracticalIds] = useState("");
  const [credentialDays, setCredentialDays] = useState("365");
  const [bulkInvites, setBulkInvites] = useState("");
  const [bulkLinks, setBulkLinks] = useState<string[]>([]);
  const [brandColor, setBrandColor] = useState("#6d4aff");
  const [brandLogo, setBrandLogo] = useState("");
  const [passwordLength, setPasswordLength] = useState("12");
  const [sessionDays, setSessionDays] = useState("30");
  const [retentionDays, setRetentionDays] = useState("2555");
  const [mfaRoles, setMfaRoles] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const load = useCallback(async () => {
    const [spaceResponse, coursesResponse] = await Promise.all([
      fetch(`/api/spaces/${id}`),
      fetch("/api/courses"),
    ]);
    if (spaceResponse.status === 401) return router.push("/login");
    const spaceData = await spaceResponse.json();
    if (!spaceResponse.ok)
      return setError(spaceData.error ?? "Could not open Space");
    setData(spaceData);
    const dashboardResponse = await fetch(
      `/api/spaces/${id}/institutional-dashboard`,
    );
    if (dashboardResponse.ok) setInstitutional(await dashboardResponse.json());
    if (spaceData.space.type === "organization") {
      const policyResponse = await fetch(`/api/spaces/${id}/institutional-policy`);
      if (policyResponse.ok) {
        const policyData = await policyResponse.json();
        if (policyData.policy?.policy_json) {
          const policy = JSON.parse(policyData.policy.policy_json);
          setPasswordLength(String(policy.minimum_password_length));
          setSessionDays(String(policy.session_max_days));
          setRetentionDays(String(policy.retention_days));
          setMfaRoles((policy.require_mfa_roles ?? []).join(", "));
        }
      }
    }
    if (coursesResponse.ok) {
      const courseData = await coursesResponse.json();
      setOwned(
        (courseData.owned ?? []).filter(
          (course: OwnedCourse) => course.status === "ready",
        ),
      );
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(path: string, body: object, method = "POST") {
    setError("");
    setNotice("");
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Action failed");
    return result;
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await mutate(`/api/spaces/${id}/invitations`, {
        email,
        role,
      });
      setInviteUrl(`${window.location.origin}${result.inviteUrl}`);
      setEmail("");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function attachAndAssign(event: FormEvent) {
    event.preventDefault();
    try {
      const selected = Number(courseId);
      await mutate(`/api/spaces/${id}/courses`, { courseId: selected });
      const ruleResult = await mutate(`/api/spaces/${id}/completion-rules`, {
        courseId: selected,
        requiredLessons: "all",
        minimumScorePercent: Number(minimumScore),
        requiredAttestationLineageIds: attestationIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        requiredPracticalReviewLineageIds: practicalIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        credential: { enabled: true, expiresAfterDays: Number(credentialDays) },
      });
      const audience =
        audienceType === "space"
          ? { wholeSpace: true }
          : audienceType === "team"
            ? { teamIds: [audienceId] }
            : { membershipIds: [audienceId] };
      await mutate(`/api/spaces/${id}/assignments`, {
        courseId: selected,
        completionRuleVersionId: ruleResult.rule.id,
        audience,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxAttempts: Number(maxAttempts),
        reminderHoursBeforeDue: dueAt ? [72, 24] : [],
        escalationHoursAfterDue: dueAt ? [24] : [],
      });
      setCourseId("");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function sendBulkInvites(event: FormEvent) {
    event.preventDefault();
    try {
      const entries = bulkInvites
        .split(/\r?\n/)
        .map((line) => {
          const [emailValue, roleValue] = line
            .split(",")
            .map((value) => value.trim());
          return { email: emailValue, role: roleValue || "learner" };
        })
        .filter((entry) => entry.email);
      const result = await mutate(`/api/spaces/${id}/bulk-invitations`, {
        entries,
      });
      setBulkLinks(
        result.invitations.map(
          (item: { email: string; inviteUrl: string }) =>
            `${item.email}: ${window.location.origin}${item.inviteUrl}`,
        ),
      );
      setBulkInvites("");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function saveBranding(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(
        `/api/spaces/${id}`,
        {
          action: "profile",
          profile: {
            branding: {
              primaryColor: brandColor,
              logoUrl: brandLogo.trim() || null,
            },
          },
        },
        "PATCH",
      );
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function publishPolicy(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(`/api/spaces/${id}/institutional-policy`, {
        action: "publish",
        minimumPasswordLength: Number(passwordLength),
        sessionMaxDays: Number(sessionDays),
        retentionDays: Number(retentionDays),
        requireMfaRoles: mfaRoles
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        legalHoldEnabled: true,
      });
      setNotice("Policy published. Existing organization sessions were revoked.");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function createSpaceHold(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(`/api/spaces/${id}/institutional-policy`, {
        action: "hold",
        reason: holdReason,
        scope: { type: "space" },
      });
      setHoldReason("");
      setNotice("Legal hold created. Space deletion is blocked until it is released.");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function downloadAudit(assignmentId: string, format: "pdf" | "csv") {
    try {
      const response = await fetch(`/api/assignments/${assignmentId}/audit?format=${format}`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Audit pack could not be generated");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bookquest-audit-${assignmentId}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function remove(userId: number) {
    try {
      await mutate(`/api/spaces/${id}/members/${userId}`, {}, "DELETE");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function changeRole(userId: number, nextRole: string) {
    try {
      await mutate(
        `/api/spaces/${id}/members/${userId}`,
        { role: nextRole },
        "PATCH",
      );
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function createTeam(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(`/api/spaces/${id}/teams`, { name: teamName });
      setTeamName("");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function setLifecycle(status: string) {
    try {
      await mutate(
        `/api/spaces/${id}`,
        { action: "lifecycle", status },
        "PATCH",
      );
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  if (!data)
    return <div className="p-6 text-ink-soft">{error || "Loading…"}</div>;
  const manages = ["owner", "administrator", "manager"].includes(
    data.membership.role,
  );
  const administers = ["owner", "administrator"].includes(data.membership.role);
  return (
    <div className="page-wrap max-w-6xl space-y-5">
      <div className="premium-panel mb-8 p-7 sm:p-10">
        <Link
          href="/spaces"
          className="relative z-10 text-xs font-bold uppercase tracking-[0.15em] text-white/75 hover:text-white"
        >
          ← Spaces
        </Link>
        <h1 className="relative z-10 mt-7 break-words font-display text-[clamp(3rem,11vw,4.5rem)] leading-[0.9] text-white">{data.space.name}</h1>
        <p className="relative z-10 mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-signal">
          {data.space.type} · {data.membership.role} · {data.space.status}
        </p>
        {data.space.description && (
          <p className="relative z-10 mt-4 max-w-2xl text-sm leading-6 text-white/75">{data.space.description}</p>
        )}
      </div>
      <nav aria-label="Space sections" className="flex w-fit gap-1 rounded-full border border-line bg-card p-1 shadow-card">
        {(["overview", "people", "settings"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-current={view === item ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${view === item ? "bg-ink text-white shadow-card" : "text-ink-soft hover:text-ink"}`}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>
      {view === "overview" && institutional && (
        <section className="paper-card p-5 sm:p-7">
          <p className="section-label mb-2">At a glance</p><h2 className="display mb-5 text-3xl">Institutional overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              ["Open", institutional.summary.in_progress],
              ["Completed", institutional.summary.completed],
              ["Overdue", institutional.summary.overdue],
              ["Active credentials", institutional.summary.active_credentials],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-paper p-4 text-left">
                <p className="display text-3xl">{value}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
              </div>
            ))}
          </div>
          {institutional.assignments.length > 0 && <div className="mt-4 space-y-2">{institutional.assignments.map((assignment) => <div key={assignment.id} className="rounded-xl border border-line bg-paper p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{assignment.course_title}</p><p className="text-xs text-ink-soft">Version {assignment.version} · {assignment.completed}/{assignment.attempts} completed · {assignment.open} open</p></div><div className="flex gap-1"><button onClick={() => void downloadAudit(assignment.id, "pdf")} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold">PDF</button><button onClick={() => void downloadAudit(assignment.id, "csv")} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold">CSV</button></div></div></div>)}</div>}
        </section>
      )}
      {view === "people" && manages && data.space.type !== "personal" && (
        <form
          onSubmit={invite}
          className="rounded-2xl bg-card border border-line p-4 space-y-3"
        >
          <h2 className="font-bold">Invite a member</h2>
          <input
            aria-label="Existing account email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Existing account email"
            className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5"
          />
          <select
            aria-label="Member role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5"
          >
            <option value="learner">Learner</option>
            <option value="manager">Manager</option>
            <option value="creator">Creator</option>
            <option value="reviewer">Reviewer</option>
            <option value="auditor">Auditor</option>
            <option value="administrator">Administrator</option>
          </select>
          <button className="w-full rounded-xl bg-primary text-white font-bold py-2.5">
            Create invitation
          </button>
          {inviteUrl && (
            <div className="rounded-xl bg-paper border border-line p-3 text-xs break-all">
              <strong>Share this private link:</strong>
              <br />
              {inviteUrl}
            </div>
          )}
        </form>
      )}
      {view === "overview" && manages && data.space.type !== "personal" && (
        <details className="panel">
          <summary className="flex items-center justify-between text-sm font-medium">Create a controlled assignment <span className="text-xs font-normal text-ink-soft">Open form</span></summary>
        <form
          onSubmit={attachAndAssign}
          className="mt-4 space-y-3 border-t border-line pt-4"
        >
          <h2 className="font-bold">Create controlled assignment</h2>
          <select
            aria-label="Course to assign"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5"
          >
            <option value="">Choose a ready course</option>
            {owned.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              Start
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink-soft">
              Due
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink-soft">
              Expiry
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink-soft">
              Attempts
              <input
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              Minimum score %
              <input
                type="number"
                min="0"
                max="100"
                value={minimumScore}
                onChange={(e) => setMinimumScore(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink-soft">
              Credential days
              <input
                type="number"
                min="1"
                value={credentialDays}
                onChange={(e) => setCredentialDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              aria-label="Audience type"
              value={audienceType}
              onChange={(e) => {
                setAudienceType(e.target.value as typeof audienceType);
                setAudienceId("");
              }}
              className="rounded-lg border border-line bg-paper p-2 text-sm"
            >
              <option value="space">All learners</option>
              <option value="team">One team</option>
              <option value="membership">One member</option>
            </select>
            {audienceType !== "space" && (
              <select
                aria-label="Audience"
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
                className="rounded-lg border border-line bg-paper p-2 text-sm"
              >
                <option value="">Choose</option>
                {audienceType === "team"
                  ? data.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))
                  : (data.members ?? [])
                      .filter(
                        (member) =>
                          member.status === "active" &&
                          member.role === "learner",
                      )
                      .map((member) => (
                        <option
                          key={member.user_id}
                          value={member.id}
                        >
                          {member.name}
                        </option>
                      ))}
              </select>
            )}
          </div>
          <details className="rounded-xl border border-line p-3">
            <summary className="text-sm font-semibold cursor-pointer">
              Advanced evidence requirements
            </summary>
            <input
              aria-label="Required attestation block lineage IDs"
              value={attestationIds}
              onChange={(e) => setAttestationIds(e.target.value)}
              placeholder="Attestation block lineage IDs, comma separated"
              className="mt-3 w-full rounded-lg border border-line bg-paper p-2 text-sm"
            />
            <input
              aria-label="Required practical block lineage IDs"
              value={practicalIds}
              onChange={(e) => setPracticalIds(e.target.value)}
              placeholder="Practical block lineage IDs, comma separated"
              className="mt-2 w-full rounded-lg border border-line bg-paper p-2 text-sm"
            />
          </details>
          <button
            disabled={!courseId || (audienceType !== "space" && !audienceId)}
            className="w-full rounded-xl bg-teal text-white font-bold py-2.5 disabled:opacity-40"
          >
            Publish rule and assign
          </button>
        </form>
        </details>
      )}
      {view === "people" && manages && data.space.type !== "personal" && (
        <details className="panel">
          <summary className="flex items-center justify-between text-sm font-medium">Teams <span className="text-xs font-normal text-ink-soft">Optional</span></summary>
        <form
          onSubmit={createTeam}
          className="mt-4 space-y-3 border-t border-line pt-4"
        >
          <h2 className="font-bold">Teams</h2>
          <div className="space-y-1">
            {data.teams.map((team) => (
              <p key={team.id} className="text-sm">
                {team.name} · {team.member_count} members
              </p>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="New team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="New team name"
              className="min-w-0 flex-1 rounded-xl border-2 border-line bg-paper px-4 py-2.5"
            />
            <button
              disabled={teamName.trim().length < 2}
              className="rounded-xl bg-primary text-white font-bold px-4 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </form>
        </details>
      )}
      {view === "people" && manages && data.space.type !== "personal" && (
        <details className="panel">
          <summary className="flex items-center justify-between text-sm font-medium">Bulk invitations <span className="text-xs font-normal text-ink-soft">Optional</span></summary>
        <form
          onSubmit={sendBulkInvites}
          className="mt-4 space-y-3 border-t border-line pt-4"
        >
          <h2 className="font-bold">Bulk invitations</h2>
          <p className="text-xs text-ink-soft">
            One existing account per line: email, role
          </p>
          <textarea
            aria-label="Bulk invitations"
            value={bulkInvites}
            onChange={(e) => setBulkInvites(e.target.value)}
            rows={4}
            placeholder={
              "learner@example.org, learner\nauditor@example.org, auditor"
            }
            className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5 text-sm"
          />
          <button
            disabled={!bulkInvites.trim()}
            className="w-full rounded-xl bg-primary text-white font-bold py-2.5 disabled:opacity-40"
          >
            Create invitation links
          </button>
          {bulkLinks.length > 0 && (
            <div className="rounded-xl bg-paper border border-line p-3 text-xs break-all space-y-1">
              {bulkLinks.map((link) => (
                <p key={link}>{link}</p>
              ))}
            </div>
          )}
        </form>
        </details>
      )}
      {view === "settings" && administers && data.space.type !== "personal" && (
        <form
          onSubmit={saveBranding}
          className="rounded-2xl bg-card border border-line p-4 space-y-3"
        >
          <h2 className="font-bold">Branding</h2>
          <div className="flex gap-2">
            <input
              aria-label="Primary brand color"
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-11 w-16 rounded-lg border border-line bg-paper p-1"
            />
            <input
              aria-label="Brand logo URL"
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              placeholder="Logo URL (optional)"
              className="min-w-0 flex-1 rounded-xl border-2 border-line bg-paper px-4 py-2.5"
            />
          </div>
          <button className="w-full rounded-xl border border-line font-bold py-2.5">
            Save branding
          </button>
        </form>
      )}
      {view === "overview" && administers && data.space.type === "organization" && (
        <Link href={`/spaces/${id}/pilot`} className="block rounded-2xl bg-card border border-line p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Phase 3 pilot</p>
          <h2 className="mt-1 font-bold">Governed pilot evidence</h2>
          <p className="mt-1 text-xs leading-5 text-ink-soft">Measure the current process, observe real journeys and bind stakeholder or assessor decisions to actual assignment, credential and audit evidence.</p>
        </Link>
      )}
      {view === "settings" && administers && data.space.type === "organization" && (
        <details className="panel">
          <summary className="flex items-center justify-between text-sm font-medium">Organization security policy <span className="text-xs font-normal text-ink-soft">Advanced</span></summary>
        <form
          onSubmit={publishPolicy}
          className="mt-4 space-y-3 border-t border-line pt-4"
        >
          <h2 className="font-bold">Organization security policy</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-ink-soft">
              Password length
              <input type="number" min="8" max="128" value={passwordLength} onChange={(event) => setPasswordLength(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm" />
            </label>
            <label className="text-xs text-ink-soft">
              Session days
              <input type="number" min="1" max="30" value={sessionDays} onChange={(event) => setSessionDays(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm" />
            </label>
            <label className="text-xs text-ink-soft">
              Retention days
              <input type="number" min="30" max="3650" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-paper p-2 text-sm" />
            </label>
          </div>
          <input aria-label="Roles requiring MFA" value={mfaRoles} onChange={(event) => setMfaRoles(event.target.value)} placeholder="Roles requiring MFA, comma separated" className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5 text-sm" />
          <p className="text-xs text-ink-soft">Policy publication revokes current organization sessions. MFA requirements can activate only after every affected member enrolls.</p>
          <button className="w-full rounded-xl bg-ink text-white font-bold py-2.5">Publish policy version</button>
        </form>
        </details>
      )}
      {view === "settings" && administers && data.space.type === "organization" && (
        <details className="panel">
          <summary className="flex items-center justify-between text-sm font-medium">Legal hold <span className="text-xs font-normal text-ink-soft">Advanced</span></summary>
        <form onSubmit={createSpaceHold} className="mt-4 space-y-3 border-t border-line pt-4">
          <h2 className="font-bold">Legal hold</h2>
          <p className="text-xs text-ink-soft">A Space-wide hold blocks deletion scheduling and records the reason immutably.</p>
          <input aria-label="Legal hold reason and authority" value={holdReason} onChange={(event) => setHoldReason(event.target.value)} placeholder="Reason and authority" className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5" />
          <button disabled={!holdReason.trim()} className="w-full rounded-xl border border-no text-no font-bold py-2.5 disabled:opacity-40">Create Space-wide hold</button>
        </form>
        </details>
      )}
      {view === "settings" && data.space.type === "personal" && (
        <section className="paper-card max-w-2xl p-6 sm:p-8">
          <p className="section-label">Personal by design</p>
          <h2 className="display mt-3 text-4xl">Nothing to configure.</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-ink-soft">Your personal Space is already private and ready for your courses. Organization controls appear only when you create an organization Space.</p>
        </section>
      )}
      {notice && <p className="text-sm text-teal font-medium">{notice}</p>}
      {error && <p className="text-sm text-no font-medium">{error}</p>}
      {view === "overview" && <section>
        <h2 className="font-bold mb-2">Assigned courses</h2>
        <div className="space-y-2">
          {data.courses.length === 0 && (
            <p className="text-sm text-ink-soft">No courses assigned yet.</p>
          )}
          {data.courses.map((course) => (
            <Link
              key={course.id}
              href={`/course/${course.id}`}
              className="block rounded-xl bg-card border border-line p-3 font-semibold"
            >
              {course.title}
            </Link>
          ))}
        </div>
      </section>}
      {view === "people" && data.members && (
        <section>
          <h2 className="font-bold mb-2">Members</h2>
          <div className="space-y-2">
            {data.members.map((member) => (
              <div
                key={member.user_id}
                className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold leading-snug">{member.name}</p>
                  <p className="text-xs text-ink-soft capitalize">
                    {member.role} · {member.status}
                  </p>
                </div>
                {manages &&
                  member.role !== "owner" &&
                  member.status === "active" && (
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <select
                        aria-label={`Role for ${member.name}`}
                        value={member.role}
                        onChange={(e) =>
                          void changeRole(member.user_id, e.target.value)
                        }
                        className="text-xs rounded-lg border border-line bg-paper p-1"
                      >
                        <option value="learner">Learner</option>
                        <option value="manager">Manager</option>
                        <option value="creator">Creator</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="auditor">Auditor</option>
                        <option value="administrator">Administrator</option>
                      </select>
                      <button
                        onClick={() => void remove(member.user_id)}
                        className="text-xs text-no font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </section>
      )}
      {view === "settings" && data.membership.role === "owner" && data.space.type !== "personal" && (
        <section className="rounded-2xl bg-card border border-line p-4 space-y-3">
          <h2 className="font-bold">Space lifecycle</h2>
          <a
            href={`/api/spaces/${id}/export`}
            className="block text-sm text-primary-deep font-semibold"
          >
            Export this Space
          </a>
          <div className="flex gap-2">
            {data.space.status === "active" ? (
              <button
                onClick={() => void setLifecycle("archived")}
                className="rounded-xl border border-line px-3 py-2 text-sm font-semibold"
              >
                Archive
              </button>
            ) : (
              <button
                onClick={() => void setLifecycle("active")}
                className="rounded-xl border border-line px-3 py-2 text-sm font-semibold"
              >
                Restore
              </button>
            )}
            <button
              onClick={() => void setLifecycle("deletion_scheduled")}
              className="rounded-xl border border-no text-no px-3 py-2 text-sm font-semibold"
            >
              Schedule deletion
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
