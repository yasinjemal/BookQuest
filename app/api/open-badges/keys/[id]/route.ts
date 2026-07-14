import { NextResponse } from "next/server";
import { publicOpenBadgeKey } from "@/lib/open-badges";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = await publicOpenBadgeKey((await params).id);
  if (!key) return NextResponse.json({ error: "Key not found" }, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
  return NextResponse.json(key, { headers: { "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
