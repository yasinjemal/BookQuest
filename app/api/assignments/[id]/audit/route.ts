import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateAssignmentAuditPack } from "@/lib/audit-pack";
import { institutionalApiError } from "@/lib/institutional-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  try {
    const pack = await generateAssignmentAuditPack(
      user.id,
      (await params).id,
      req.nextUrl.searchParams.get("versionId") ?? undefined
    );
    const format = req.nextUrl.searchParams.get("format") ?? "pdf";
    if (format === "csv") {
      return new NextResponse(pack.csv, { headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookquest-audit-${pack.id}.csv"`,
        "X-BookQuest-Audit-Pack": pack.id,
        "X-BookQuest-Artifact-Hash": pack.artifactHash,
      } });
    }
    if (format !== "pdf") return NextResponse.json({ error: "Format must be pdf or csv" }, { status: 400 });
    return new NextResponse(Buffer.from(pack.pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bookquest-audit-${pack.id}.pdf"`,
      "X-BookQuest-Audit-Pack": pack.id,
      "X-BookQuest-Artifact-Hash": pack.artifactHash,
    } });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}
