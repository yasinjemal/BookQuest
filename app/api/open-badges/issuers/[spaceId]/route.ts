import { NextResponse } from "next/server";
import { one } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const issuer = await one<{ name: string }>(
    `SELECT space.name FROM spaces space
     WHERE space.id=$1 AND EXISTS (SELECT 1 FROM open_badge_issuer_keys key WHERE key.space_id=space.id)`,
    [spaceId],
  );
  if (!issuer) return NextResponse.json({ error: "Issuer not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ id: new URL(req.url).toString(), type: ["Profile"], name: issuer.name }, {
    headers: { "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
