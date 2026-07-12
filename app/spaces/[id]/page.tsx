"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface Dashboard {
  space: { id: string; name: string; description: string; type: string; status: string };
  membership: { role: string };
  members: Array<{ user_id: number; name: string; role: string; status: string }> | null;
  courses: Array<{ id: number; title: string; status: string }>;
  assignments: Array<{ id: string; course_id: number; status: string; due_at: string | null }>;
  teams: Array<{ id: string; name: string; status: string; member_count: number }>;
}
interface OwnedCourse { id: number; title: string; status: string }

export default function SpacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [owned, setOwned] = useState<OwnedCourse[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("learner");
  const [courseId, setCourseId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [spaceResponse, coursesResponse] = await Promise.all([fetch(`/api/spaces/${id}`), fetch("/api/courses")]);
    if (spaceResponse.status === 401) return router.push("/login");
    const spaceData = await spaceResponse.json();
    if (!spaceResponse.ok) return setError(spaceData.error ?? "Could not open Space");
    setData(spaceData);
    if (coursesResponse.ok) {
      const courseData = await coursesResponse.json();
      setOwned((courseData.owned ?? []).filter((course: OwnedCourse) => course.status === "ready"));
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(path: string, body: object, method = "POST") {
    setError("");
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Action failed");
    return result;
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await mutate(`/api/spaces/${id}/invitations`, { email, role });
      setInviteUrl(`${window.location.origin}${result.inviteUrl}`);
      setEmail("");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function attachAndAssign(event: FormEvent) {
    event.preventDefault();
    try {
      const selected = Number(courseId);
      await mutate(`/api/spaces/${id}/courses`, { courseId: selected });
      await mutate(`/api/spaces/${id}/assignments`, { courseId: selected });
      setCourseId("");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function remove(userId: number) {
    try {
      await mutate(`/api/spaces/${id}/members/${userId}`, {}, "DELETE");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function changeRole(userId: number, nextRole: string) {
    try {
      await mutate(`/api/spaces/${id}/members/${userId}`, { role: nextRole }, "PATCH");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function createTeam(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(`/api/spaces/${id}/teams`, { name: teamName });
      setTeamName("");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  async function setLifecycle(status: string) {
    try {
      await mutate(`/api/spaces/${id}`, { action: "lifecycle", status }, "PATCH");
      await load();
    } catch (caught) { setError((caught as Error).message); }
  }

  if (!data) return <div className="p-6 text-ink-soft">{error || "Loading…"}</div>;
  const manages = ["owner", "administrator", "manager"].includes(data.membership.role);
  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <div><Link href="/spaces" className="text-sm text-primary-deep font-semibold">← Spaces</Link><h1 className="text-2xl font-extrabold mt-2">{data.space.name}</h1><p className="text-sm text-ink-soft capitalize">{data.space.type} · {data.membership.role} · {data.space.status}</p>{data.space.description && <p className="text-sm mt-2">{data.space.description}</p>}</div>
      {manages && data.space.type !== "personal" && <form onSubmit={invite} className="rounded-2xl bg-card border border-line p-4 space-y-3"><h2 className="font-bold">Invite a member</h2><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Existing account email" className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5" /><select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5"><option value="learner">Learner</option><option value="manager">Manager</option><option value="creator">Creator</option><option value="reviewer">Reviewer</option><option value="auditor">Auditor</option><option value="administrator">Administrator</option></select><button className="w-full rounded-xl bg-primary text-white font-bold py-2.5">Create invitation</button>{inviteUrl && <div className="rounded-xl bg-paper border border-line p-3 text-xs break-all"><strong>Share this private link:</strong><br />{inviteUrl}</div>}</form>}
      {manages && data.space.type !== "personal" && <form onSubmit={attachAndAssign} className="rounded-2xl bg-card border border-line p-4 space-y-3"><h2 className="font-bold">Assign a course</h2><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-full rounded-xl border-2 border-line bg-paper px-4 py-2.5"><option value="">Choose a ready course</option>{owned.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select><button disabled={!courseId} className="w-full rounded-xl bg-teal text-white font-bold py-2.5 disabled:opacity-40">Attach and assign</button></form>}
      {manages && data.space.type !== "personal" && <form onSubmit={createTeam} className="rounded-2xl bg-card border border-line p-4 space-y-3"><h2 className="font-bold">Teams</h2><div className="space-y-1">{data.teams.map((team) => <p key={team.id} className="text-sm">{team.name} · {team.member_count} members</p>)}</div><div className="flex gap-2"><input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" className="min-w-0 flex-1 rounded-xl border-2 border-line bg-paper px-4 py-2.5" /><button disabled={teamName.trim().length < 2} className="rounded-xl bg-primary text-white font-bold px-4 disabled:opacity-40">Add</button></div></form>}
      {error && <p className="text-sm text-no font-medium">{error}</p>}
      <section><h2 className="font-bold mb-2">Assigned courses</h2><div className="space-y-2">{data.courses.length === 0 && <p className="text-sm text-ink-soft">No courses assigned yet.</p>}{data.courses.map((course) => <Link key={course.id} href={`/course/${course.id}`} className="block rounded-xl bg-card border border-line p-3 font-semibold">{course.title}</Link>)}</div></section>
      {data.members && <section><h2 className="font-bold mb-2">Members</h2><div className="space-y-2">{data.members.map((member) => <div key={member.user_id} className="rounded-xl bg-card border border-line p-3 flex justify-between gap-3"><div className="min-w-0"><p className="font-semibold truncate">{member.name}</p><p className="text-xs text-ink-soft capitalize">{member.role} · {member.status}</p></div>{manages && member.role !== "owner" && member.status === "active" && <div className="flex items-center gap-2"><select aria-label={`Role for ${member.name}`} value={member.role} onChange={(e) => void changeRole(member.user_id, e.target.value)} className="text-xs rounded-lg border border-line bg-paper p-1"><option value="learner">Learner</option><option value="manager">Manager</option><option value="creator">Creator</option><option value="reviewer">Reviewer</option><option value="auditor">Auditor</option><option value="administrator">Administrator</option></select><button onClick={() => void remove(member.user_id)} className="text-xs text-no font-semibold">Remove</button></div>}</div>)}</div></section>}
      {data.membership.role === "owner" && data.space.type !== "personal" && <section className="rounded-2xl bg-card border border-line p-4 space-y-3"><h2 className="font-bold">Space lifecycle</h2><a href={`/api/spaces/${id}/export`} className="block text-sm text-primary-deep font-semibold">Export this Space</a><div className="flex gap-2">{data.space.status === "active" ? <button onClick={() => void setLifecycle("archived")} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">Archive</button> : <button onClick={() => void setLifecycle("active")} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">Restore</button>}<button onClick={() => void setLifecycle("deletion_scheduled")} className="rounded-xl border border-no text-no px-3 py-2 text-sm font-semibold">Schedule deletion</button></div></section>}
    </div>
  );
}
