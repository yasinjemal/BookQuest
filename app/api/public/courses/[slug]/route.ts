import { NextResponse } from "next/server";
import { getPublicCourseBySlug } from "@/lib/public-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const course = await getPublicCourseBySlug((await params).slug);
  return course ? NextResponse.json({ course }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
