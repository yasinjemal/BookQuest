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
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  return NextResponse.json({
    user: publicUser(user),
    stats: getStats(user.id),
    dueReviews: countDueReviews(user.id),
    leaderboard: weeklyLeaderboard(20),
    certificates: listCertificates(user.id).map((c) => ({
      id: c.id,
      course_title: c.course_title,
      score_pct: c.score_pct,
      issued_at: c.issued_at,
    })),
  });
}
