import { NextRequest, NextResponse } from "next/server";
import { verifyGenerationSecret } from "@/lib/generation";
import { dispatchDueAssignmentDeliveries, expireDueCredentials } from "@/lib/institutional";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!verifyGenerationSecret(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const at = new Date().toISOString();
  const [deliveries, credentials] = await Promise.all([
    dispatchDueAssignmentDeliveries(at),
    expireDueCredentials(at),
  ]);
  return NextResponse.json({ at, deliveries, credentials });
}

