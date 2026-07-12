import { NextRequest, NextResponse } from "next/server";
import {
  countDueReviews,
  getStats,
  listCertificates,
  weeklyLeaderboard,
} from "@/lib/db";
import { publicUser, requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const [stats, dueReviews, leaderboard, certificates] = await Promise.all([
    getStats(user.id),
    countDueReviews(user.id),
    weeklyLeaderboard(20),
    listCertificates(user.id),
  ]);
  return NextResponse.json({
    user: publicUser(user),
    stats,
    dueReviews,
    leaderboard,
    certificates: certificates.map((c) => ({
      id: c.id,
      course_title: c.course_title,
      score_pct: c.score_pct,
      issued_at: c.issued_at,
    })),
  });
}
