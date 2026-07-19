import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listOwnedReadingEditions } from "@/lib/reading-editions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const books = await listOwnedReadingEditions(user.id);
  return NextResponse.json(
    { books },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
