import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { exportQti3ItemBank, importQti3ItemBank, QtiPackageError } from "@/lib/qti";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

function errorResponse(error: unknown) {
  if (error instanceof QtiPackageError) {
    return NextResponse.json({ error: error.message }, { status: 400, headers: privateHeaders });
  }
  const response = studioApiError(error);
  if (response) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course" }, { status: 400, headers: privateHeaders });
  }
  try {
    const exported = await exportQti3ItemBank(user.id, courseId);
    return new NextResponse(Buffer.from(exported.bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="bookquest-course-${courseId}-qti3.zip"`,
        "X-BookQuest-QTI-Profile": exported.profile,
        "X-BookQuest-QTI-Items": String(exported.itemCount),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course" }, { status: 400, headers: privateHeaders });
  }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Upload a QTI 3.0 .zip package" }, { status: 400, headers: privateHeaders }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip") || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Upload one QTI 3.0 .zip package up to 5 MB" }, { status: 400, headers: privateHeaders });
  }
  try {
    const imported = await importQti3ItemBank(user.id, courseId, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ import: imported }, { status: 201, headers: privateHeaders });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    throw error;
  }
}
