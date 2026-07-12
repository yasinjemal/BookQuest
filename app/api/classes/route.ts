import { NextRequest, NextResponse } from "next/server";
import {
  createClassroom,
  getClassroomByCode,
  joinClassroom,
  listMyClassrooms,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  return NextResponse.json({ classes: await listMyClassrooms(user.id) });
}

/** Create a class {name} or join one {code}. */
export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const body = (await req.json()) as { name?: string; code?: string };

  if (body.name?.trim()) {
    const classroom = await createClassroom(user.id, body.name);
    return NextResponse.json({ classroom });
  }
  if (body.code?.trim()) {
    const classroom = await getClassroomByCode(body.code);
    if (!classroom) {
      return NextResponse.json(
        { error: "No class found with that code. Check with your teacher." },
        { status: 404 }
      );
    }
    if (classroom.owner_id === user.id) {
      return NextResponse.json(
        { error: "You are the teacher of this class." },
        { status: 400 }
      );
    }
    await joinClassroom(classroom.id, user.id);
    return NextResponse.json({ classroom });
  }
  return NextResponse.json(
    { error: "Provide a class name to create, or a code to join." },
    { status: 400 }
  );
}
