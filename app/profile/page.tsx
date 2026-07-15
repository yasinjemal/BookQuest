"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseWorld from "@/components/CourseWorld";
import Loading from "@/components/Loading";
import { clearAnswerOutboxAccount, flushAnswerOutbox } from "@/lib/answer-outbox";
import { clearOfflineCourseCache } from "@/lib/offline-course-cache";

interface Data {
  user: { id: number; email: string; name: string; role: string; credits: number; premium_until: string | null };
  stats: { total_xp: number; streak: number };
  dueReviews: number;
  leaderboard: { user_id: number; name: string; xp: number }[];
  certificates: { id: string; course_title: string; score_pct: number }[];
  privacy: {
    accountStatus: "active" | "deletion_scheduled" | "erased";
    deletionScheduledAt: string | null;
    consents: {
      service: { decision: "granted" | "withdrawn" } | null;
      analytics: { decision: "granted" | "withdrawn" } | null;
      product_research: { decision: "granted" | "withdrawn" } | null;
    };
  };
}

const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000];
const STORE = [
  { id: "credits_5", title: "5 creation credits", sub: "Create five AI-assisted course drafts", price: "$2.99" },
  { id: "credits_15", title: "15 creation credits", sub: "A larger pack for regular creation", price: "$6.99" },
  { id: "premium_month", title: "Premium · 1 month", sub: "15 credits and premium account status", price: "$4.99" },
];

function ProfileInner() {
  const router = useRouter();
  const search = useSearchParams();
  const payment = search.get("payment");
  const [data, setData] = useState<Data | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [mfaActive, setMfaActive] = useState(false);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(payment === "success" ? "Payment received — thank you." : payment === "failed" ? "Payment did not complete. You were not charged." : payment === "cancelled" ? "Payment cancelled." : null);

  const load = useCallback(async () => {
    const [res, privacyRes, mfaRes] = await Promise.all([fetch("/api/stats"), fetch("/api/account/privacy"), fetch("/api/account/mfa")]);
    if (res.status === 401) { router.push("/login"); return; }
    if (!res.ok || !privacyRes.ok) { setNotice("Could not load your account settings."); return; }
    setData({ ...(await res.json()), privacy: await privacyRes.json() });
    if (mfaRes.ok) setMfaActive((await mfaRes.json()).active === true);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function mfaAction(action: "begin" | "confirm" | "disable") {
    setNotice(null);
    const response = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code: mfaCode }) });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error ?? "MFA action failed");
    if (action === "begin") { setMfaSecret(result.secret); setNotice("Add the secret to your authenticator, then enter its 6-digit code."); }
    else if (action === "confirm") { setMfaActive(true); setMfaSecret(null); setMfaCode(""); setRecoveryCodes(result.recoveryCodes ?? []); setNotice("Authenticator MFA is active. Save the recovery codes now; they are shown once."); }
    else { setMfaActive(false); setMfaCode(""); setRecoveryCodes([]); setNotice("Authenticator MFA is disabled."); }
  }

  async function buy(product: string) {
    setBuying(product); setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product }) });
      const result = await res.json();
      if (!res.ok) setNotice(result.error ?? "Could not start payment.");
      else if (result.link) window.location.href = result.link;
      else if (result.simulated) { setNotice("Test-mode purchase complete. No real payment was made."); await load(); }
    } catch { setNotice("Network error — are you online?"); }
    finally { setBuying(null); }
  }

  async function logout() {
    await flushAnswerOutbox();
    try {
      await clearOfflineCourseCache();
    } catch {
      setNotice("Could not clear saved offline courses. Close other BookQuest tabs and try signing out again.");
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" });
    clearAnswerOutboxAccount();
    router.push("/login"); router.refresh();
  }

  async function setConsent(purpose: "analytics" | "product_research", granted: boolean) {
    const res = await fetch("/api/account/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, granted }) });
    const result = await res.json();
    if (!res.ok) { setNotice(result.error ?? "Could not save your privacy choice."); return; }
    setNotice("Privacy choice saved."); await load();
  }

  async function scheduleDeletion() {
    if (!window.confirm("Schedule account deletion? You will have 30 days to cancel. Download your data first if you want a copy.")) return;
    const password = window.prompt("Enter your password to confirm account deletion:");
    if (!password) return;
    const res = await fetch("/api/account/deletion", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const result = await res.json();
    if (!res.ok) { setNotice(result.error ?? "Could not schedule deletion."); return; }
    setNotice(`Deletion scheduled for ${new Date(result.effectiveAt).toLocaleDateString()}.`); await load();
  }

  async function cancelDeletion() {
    const res = await fetch("/api/account/deletion", { method: "POST" });
    const result = await res.json();
    if (!res.ok) { setNotice(result.error ?? "Could not cancel deletion."); return; }
    setNotice("Account deletion cancelled."); await load();
  }

  if (!data) return <Loading />;
  const { user, stats } = data;
  const isAdmin = user.role === "admin";
  const premium = !!user.premium_until && user.premium_until > new Date().toISOString();
  const xp = stats.total_xp;
  let level = 1;
  while (level < LEVELS.length && xp >= LEVELS[level]) level++;
  const prev = LEVELS[level - 1];
  const next = LEVELS[Math.min(level, LEVELS.length - 1)];
  const pct = next > prev ? Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100)) : 100;

  return <div className="page-wrap"><div className="content-measure max-w-6xl">
    <header className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[.9fr_1.1fr]">
      <CourseWorld seed={`journal:${user.id}`} theme="archive" progress={pct} className="min-h-64 lg:min-h-[26rem]" />
      <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Your learning journal</p><h1 className="display mt-3 text-[clamp(3.2rem,11vw,6rem)] leading-[0.88]">{user.name}</h1><p className="mt-4 text-sm text-white/70">{user.email}</p><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold capitalize">{user.role}</span>{premium && <span className="rounded-full bg-signal px-3 py-1.5 text-xs font-bold text-ink">Premium account</span>}</div></div>
    </header>

    {notice && <div role="status" className="mt-5 rounded-xl border border-teal/25 bg-teal/8 px-4 py-3 text-sm font-semibold text-teal-deep">{notice}</div>}

    <section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]" aria-labelledby="journey-progress-heading">
      <div className="rounded-[1.5rem] border border-line bg-card p-6 shadow-card sm:p-8"><p className="section-label">Journey progress</p><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><h2 id="journey-progress-heading" className="display text-4xl">Level {level}</h2><span className="text-sm font-semibold text-ink-soft">{xp} of {next} learning points</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Progress through level ${level}`} aria-valuemin={prev} aria-valuemax={next} aria-valuenow={Math.max(prev, Math.min(xp, next))}><div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} /></div><p className="mt-3 text-xs leading-5 text-ink-soft">A quiet record of completed learning—not a competition you need to chase.</p></div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-[1.3rem] bg-go-soft p-5"><span className="grid h-9 w-9 place-items-center rounded-full bg-forest text-white"><AppIcon name="trail" className="h-4 w-4" /></span><p className="display mt-8 text-3xl">{stats.streak}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-soft">Days returning</p></div><div className="rounded-[1.3rem] bg-sky p-5"><span className="grid h-9 w-9 place-items-center rounded-full bg-dusk text-white"><AppIcon name="practice" className="h-4 w-4" /></span><p className="display mt-8 text-3xl">{data.dueReviews}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-soft">Reviews ready</p></div></div>
    </section>

    {data.dueReviews > 0 && <Link href="/review" className="mt-5 flex min-h-16 items-center gap-4 rounded-[1.3rem] border border-teal/25 bg-teal/8 px-5 py-4 text-teal-deep shadow-card"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal text-white"><AppIcon name="practice" className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block">A quiet review is ready</strong><span className="mt-0.5 block text-xs text-ink-soft">{data.dueReviews} question{data.dueReviews === 1 ? "" : "s"} worth revisiting</span></span><AppIcon name="arrow" className="h-4 w-4" /></Link>}

    {data.certificates.length > 0 && <section className="mt-12" aria-labelledby="achievements-heading"><p className="section-label">Recent achievements</p><h2 id="achievements-heading" className="display mt-2 text-4xl">Journeys you can stand behind</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{data.certificates.map((certificate) => <Link key={certificate.id} href={`/cert/${certificate.id}`} className="flex min-h-24 items-center gap-4 rounded-[1.3rem] border border-line bg-card p-5 shadow-card hover:border-line-deep"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-signal text-ink"><AppIcon name="shield" className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block leading-snug">{certificate.course_title}</strong><span className="mt-1 block text-xs text-ink-soft">Verified course completion · {certificate.score_pct}%</span></span><AppIcon name="arrow" className="h-4 w-4 text-ink-soft" /></Link>)}</div></section>}

    <section className="mt-12 grid gap-5 lg:grid-cols-2" aria-label="Security and account plan">
      <div className="rounded-[1.5rem] border border-line bg-card p-6 shadow-card sm:p-8"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest text-white"><AppIcon name="shield" className="h-5 w-5" /></span><div><p className="section-label">Privacy & security</p><h2 className="display mt-2 text-3xl">Your account stays yours.</h2></div></div><div className="mt-6 border-t border-line pt-5"><p className="text-sm font-semibold">Authenticator MFA {mfaActive ? "is active" : "is not active"}</p><p className="mt-1 text-xs leading-5 text-ink-soft">Use an authenticator app for stronger sign-in protection.</p>{!mfaActive && !mfaSecret && <button onClick={() => void mfaAction("begin")} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">Set up authenticator</button>}{mfaSecret && <div className="mt-4 space-y-3"><p className="text-xs text-ink-soft">Manual setup secret</p><code className="block select-all break-all rounded-lg border border-line bg-paper p-3 text-xs">{mfaSecret}</code><label className="block text-xs font-semibold">6-digit code<input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" className="field mt-2" /></label><button disabled={!/^\d{6}$/.test(mfaCode)} onClick={() => void mfaAction("confirm")} className="btn-primary">Confirm MFA</button></div>}{mfaActive && <div className="mt-4 space-y-3"><label className="block text-xs font-semibold">Current 6-digit code<input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" className="field mt-2" /></label><button disabled={!/^\d{6}$/.test(mfaCode)} onClick={() => void mfaAction("disable")} className="inline-flex min-h-11 items-center rounded-full border border-no/45 px-5 text-sm font-semibold text-no disabled:opacity-40">Disable MFA</button></div>}{recoveryCodes.length > 0 && <div className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-4"><p className="text-xs font-bold">One-time recovery codes</p><div className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-2">{recoveryCodes.map((code) => <span key={code}>{code}</span>)}</div></div>}</div></div>

      <div className="rounded-[1.5rem] border border-line bg-card p-6 shadow-card sm:p-8"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="create" className="h-5 w-5" /></span><div><p className="section-label">Plan & credits</p><h2 className="display mt-2 text-3xl">Creation when you need it.</h2></div></div><p className="mt-6 text-sm leading-6 text-ink-soft">You currently have <strong className="text-ink">{isAdmin ? "unlimited creator access" : `${user.credits} creation credit${user.credits === 1 ? "" : "s"}`}</strong>. Learning never uses credits.</p>{!isAdmin && <details className="mt-5 rounded-xl border border-line p-4"><summary className="min-h-11 font-semibold">View credit and plan options</summary><div className="mt-4 space-y-2 border-t border-line pt-4">{STORE.map((product) => <button key={product.id} onClick={() => void buy(product.id)} disabled={buying !== null} className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-paper p-4 text-left disabled:opacity-50"><AppIcon name="create" className="h-5 w-5 shrink-0 text-teal" /><span className="min-w-0 flex-1"><strong className="block text-sm">{product.title}</strong><span className="block text-xs text-ink-soft">{product.sub}</span></span><span className="font-semibold text-teal-deep">{buying === product.id ? "…" : product.price}</span></button>)}</div><p className="mt-3 text-[10px] leading-4 text-ink-soft">Payments by Flutterwave. Cards and supported mobile money methods vary by region.</p></details>}</div>
    </section>

    <section className="mt-12" aria-labelledby="community-heading"><p className="section-label">Community context</p><h2 id="community-heading" className="display mt-2 text-4xl">This week in your circle</h2><div className="mt-5 overflow-hidden rounded-[1.4rem] border border-line bg-card shadow-card">{data.leaderboard.length === 0 && <p className="p-6 text-sm text-ink-soft">Complete a lesson to appear here.</p>}{data.leaderboard.map((row, index) => <div key={row.user_id} className={`flex min-h-14 items-center gap-4 border-b border-line px-5 py-3 last:border-0 ${row.user_id === user.id ? "bg-teal/5" : ""}`}><span className="grid h-8 w-8 place-items-center rounded-full bg-paper text-xs font-bold text-ink-soft">{index + 1}</span><span className="min-w-0 flex-1 font-semibold">{row.name}{row.user_id === user.id && " (you)"}</span><span className="text-sm font-semibold text-ink-soft">{row.xp} points</span></div>)}</div></section>

    <details className="panel mt-12"><summary className="flex min-h-11 items-center justify-between gap-4 font-semibold">Privacy, data, and account lifecycle <AppIcon name="settings" className="h-4 w-4 text-ink-soft" /></summary><div className="mt-5 space-y-6 border-t border-line pt-5"><div><h2 className="text-sm font-bold">Portable account export</h2><p className="mt-1 text-xs leading-5 text-ink-soft">Download your profile, owned course content, learning history, consent history, credentials, and billing records as JSON. Passwords, sessions, and security tokens are never included.</p><a href="/api/account/export" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-deep px-5 text-sm font-semibold"><AppIcon name="download" className="h-4 w-4" />Download my data</a></div><div className="border-t border-line pt-5"><h2 className="text-sm font-bold">Optional data use</h2><div className="mt-3 space-y-3">{([ ["analytics", "Improve product analytics"], ["product_research", "Use eligible data for product research"] ] as const).map(([purpose, label]) => <label key={purpose} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={data.privacy.consents[purpose]?.decision === "granted"} onChange={(event) => void setConsent(purpose, event.target.checked)} className="mt-1 h-4 w-4" /><span>{label}<span className="block text-xs leading-5 text-ink-soft">Optional. Withdraw this choice at any time.</span></span></label>)}</div></div><div className="border-t border-line pt-5"><h2 className="text-sm font-bold text-no">Delete account</h2><p className="mt-1 text-xs leading-5 text-ink-soft">Deletion has a 30-day cancellation period. Direct identifiers and private content are erased afterward. Pseudonymous evidence, consent history, and legally required financial records are retained.</p>{data.privacy.accountStatus === "deletion_scheduled" ? <div className="mt-3"><p className="text-xs font-bold text-no">Scheduled for {new Date(data.privacy.deletionScheduledAt!).toLocaleDateString()}</p><button onClick={() => void cancelDeletion()} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line-deep px-5 text-sm font-semibold">Cancel deletion</button></div> : <button onClick={() => void scheduleDeletion()} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-no/45 px-5 text-sm font-semibold text-no">Schedule account deletion</button>}</div></div></details>

    <footer className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-4 text-xs font-semibold text-teal-deep"><Link href="/passport">Private Skill Passport</Link><Link href="/security">Security</Link><Link href="/accessibility">Accessibility</Link><Link href="/verify-credential">Verify credential</Link></div><button onClick={() => void logout()} className="inline-flex min-h-11 w-fit items-center rounded-full border border-line-deep px-5 text-sm font-semibold text-ink-soft">Sign out</button></footer>
    {isAdmin && <Link href="/admin" className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white"><AppIcon name="settings" className="h-4 w-4" />Open administration</Link>}
  </div></div>;
}

export default function ProfilePage() {
  return <Suspense fallback={<Loading />}><ProfileInner /></Suspense>;
}
