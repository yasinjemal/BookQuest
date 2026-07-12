import { NextResponse } from "next/server";
import { listPublicSpaces } from "@/lib/spaces";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ spaces: await listPublicSpaces() });
}
