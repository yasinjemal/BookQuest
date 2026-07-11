import { NextRequest, NextResponse } from "next/server";
import { countDueReviews, getStats, weeklyLeaderboard } from "@/lib/db";
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
  });
}
