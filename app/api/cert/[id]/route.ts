import { NextRequest, NextResponse } from "next/server";
import { getCertificate } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public — anyone with the link can verify a certificate. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cert = getCertificate(id);
  if (!cert) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  return NextResponse.json({
    certificate: {
      id: cert.id,
      learner: cert.user_name,
      course: cert.course_title,
      score_pct: cert.score_pct,
      issued_at: cert.issued_at,
    },
  });
}
