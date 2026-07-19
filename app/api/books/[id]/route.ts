import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  deleteReadingEdition,
  getOwnedReadingEditionMetadata,
  saveReadingProgress,
  searchOwnedReadingEdition,
} from "@/lib/reading-editions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readingEditionId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const editionId = readingEditionId((await params).id);
  if (!editionId) return NextResponse.json({ error: "Invalid book id" }, { status: 400 });

  const query = req.nextUrl.searchParams.get("q");
  if (query !== null) {
    const results = await searchOwnedReadingEdition(editionId, user.id, query);
    if (!results) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const book = await getOwnedReadingEditionMetadata(editionId, user.id);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  return NextResponse.json(
    { book },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const editionId = readingEditionId((await params).id);
  if (!editionId) return NextResponse.json({ error: "Invalid book id" }, { status: 400 });

  const body = await req.json().catch(() => null) as {
    unitIndex?: unknown;
    unitProgress?: unknown;
    overallProgress?: unknown;
  } | null;
  const unitIndex = Number(body?.unitIndex);
  const unitProgress = Number(body?.unitProgress);
  const overallProgress = Number(body?.overallProgress);
  if (
    !Number.isInteger(unitIndex) || unitIndex < 0 ||
    !Number.isFinite(unitProgress) || unitProgress < 0 || unitProgress > 100 ||
    !Number.isFinite(overallProgress) || overallProgress < 0 || overallProgress > 100
  ) {
    return NextResponse.json({ error: "Invalid reading progress" }, { status: 400 });
  }

  const progress = await saveReadingProgress({
    editionId,
    userId: user.id,
    unitIndex,
    unitProgress,
    overallProgress,
  });
  if (!progress) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  return NextResponse.json(
    { progress },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const editionId = readingEditionId((await params).id);
  if (!editionId) return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
  const deleted = await deleteReadingEdition(editionId, user.id);
  if (!deleted) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
