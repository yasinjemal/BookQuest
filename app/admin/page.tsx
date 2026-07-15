"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Loading from "@/components/Loading";

interface AdminData {
  counts: { users: number; courses: number; published: number; revenue_cents: number };
  learningLedger: {
    events: number;
    events_24h: number;
    learners: number;
    question_versions: number;
    malformed: number;
  };
  operations: {
    total_24h: number;
    errors_24h: number;
    warnings_24h: number;
    rate_limited_24h: number;
    ai_requests_24h: number;
    ai_failures_24h: number;
    alerts: string[];
    recent: {
      event_type: string;
      severity: "info" | "warning" | "error";
      area: string;
      occurred_at: string;
    }[];
  };
  delivery: {
    delayed_events_24h: number;
    max_delay_seconds: number;
    answer_failures_24h: number;
    delayed_sample: {
      session_kind: string;
      course_id: number | null;
      delay_seconds: number;
      recorded_at: string;
    }[];
    failure_sample: {
      area: string;
      occurred_at: string;
      answer_source: string | null;
      error_fingerprint: string | null;
    }[];
    alerts: string[];
  };
  users: {
    id: number;
    email: string;
    name: string;
    role: string;
    credits: number;
    premium_until: string | null;
    created_at: string;
  }[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin");
    if (res.status === 401) return router.push("/login");
    if (res.status === 403) return router.push("/");
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function grant(userId: number) {
    const amount = prompt("Credits to add (negative to remove):", "5");
    if (!amount) return;
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, credits: Number(amount) }),
    });
    load();
  }

  if (!data) return <Loading />;

  const c = data.counts;
  return (
    <div className="page-wrap max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-4">Admin</h1>

      <Link
        href="/admin/learning-genome"
        className="mb-4 block rounded-2xl border border-line bg-card p-4 shadow-card"
      >
        <span className="font-bold">Learning quality review →</span>
        <span className="block text-xs text-ink-soft mt-1">
          Version consent-eligible evidence, inspect question flags, and record human decisions.
        </span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        {[
          ["👤 Users", c.users],
          ["📚 Courses", c.courses],
          ["🌍 Published", c.published],
          ["💰 Revenue", `$${(c.revenue_cents / 100).toFixed(2)}`],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-card border border-line p-4 text-center shadow-card"
          >
            <div className="text-xl font-extrabold">{value}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Learning evidence
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Answer events", data.learningLedger.events],
          ["Last 24 hours", data.learningLedger.events_24h],
          ["Learners captured", data.learningLedger.learners],
          ["Question versions", data.learningLedger.question_versions],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-card border border-line p-4 shadow-card"
          >
            <div className="text-xl font-extrabold">{value ?? 0}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>
      {data.learningLedger.malformed > 0 && (
        <p className="mt-2 text-sm text-no font-semibold">
          {data.learningLedger.malformed} malformed evidence events need attention.
        </p>
      )}

      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Operations · last 24 hours
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["AI requests", data.operations.ai_requests_24h],
          ["AI failures", data.operations.ai_failures_24h],
          ["Rate limited", data.operations.rate_limited_24h],
          ["Server errors", data.operations.errors_24h],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-card border border-line p-4 shadow-card"
          >
            <div className="text-xl font-extrabold">{value ?? 0}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>
      {data.operations.alerts.map((alert) => (
        <p key={alert} className="mt-2 text-sm text-no font-semibold">
          {alert}
        </p>
      ))}
      {data.operations.recent.length > 0 && (
        <div className="rounded-2xl bg-card border border-line shadow-card divide-y divide-line mt-3">
          {data.operations.recent.map((event, index) => (
            <div key={`${event.occurred_at}-${index}`} className="px-4 py-3">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{event.area}</span>
                <span className={event.severity === "error" ? "text-no" : "text-ink-soft"}>
                  {event.severity}
                </span>
              </div>
              <div className="text-xs text-ink-soft mt-0.5">
                {event.event_type} · {new Date(event.occurred_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Delivery health · last 24 hours
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Delayed answers", data.delivery.delayed_events_24h],
          ["Max delay", formatDuration(data.delivery.max_delay_seconds)],
          ["Answer failures", data.delivery.answer_failures_24h],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-card border border-line p-4 text-center shadow-card"
          >
            <div className="text-xl font-extrabold">{value ?? 0}</div>
            <div className="text-xs text-ink-soft">{label}</div>
          </div>
        ))}
      </div>
      {data.delivery.alerts.map((alert) => (
        <p key={alert} className="mt-2 text-sm text-no font-semibold">
          {alert}
        </p>
      ))}
      {data.delivery.delayed_sample.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-xs font-bold text-ink-soft uppercase tracking-wide">
            Most delayed answers
          </p>
          <div className="rounded-2xl bg-card border border-line shadow-card divide-y divide-line">
            {data.delivery.delayed_sample.map((event, index) => (
              <div
                key={`delayed-${event.recorded_at}-${index}`}
                className="px-4 py-3 flex justify-between gap-3 text-sm"
              >
                <span className="font-semibold">
                  {event.session_kind}
                  {event.course_id !== null && (
                    <span className="text-ink-soft"> · course {event.course_id}</span>
                  )}
                </span>
                <span className="text-ink-soft">
                  {formatDuration(event.delay_seconds)} late
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {data.delivery.failure_sample.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-xs font-bold text-ink-soft uppercase tracking-wide">
            Recent answer failures
          </p>
          <div className="rounded-2xl bg-card border border-line shadow-card divide-y divide-line">
            {data.delivery.failure_sample.map((event, index) => (
              <div key={`failure-${event.occurred_at}-${index}`} className="px-4 py-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{event.area}</span>
                  <span className="text-ink-soft">
                    {event.answer_source ?? "unknown"}
                  </span>
                </div>
                <div className="text-xs text-ink-soft mt-0.5">
                  {event.error_fingerprint
                    ? `fingerprint ${event.error_fingerprint} · `
                    : ""}
                  {new Date(event.occurred_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Users
      </h2>
      <div className="rounded-2xl bg-card border border-line shadow-card divide-y divide-line">
        {data.users.map((u) => (
          <div key={u.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">
                {u.name} {u.role === "admin" && "🛠"}
              </div>
              <div className="text-xs text-ink-soft truncate">{u.email}</div>
            </div>
            <span className="text-sm font-bold text-primary-deep">⚡{u.credits}</span>
            <button
              onClick={() => grant(u.id)}
              className="text-xs font-bold border border-line rounded-lg px-2.5 py-1.5"
            >
              +⚡
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
