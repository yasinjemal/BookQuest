import { NextRequest, NextResponse } from "next/server";
import {
  assignCourse,
  classWeakConcepts,
  classroomAssignments,
  classroomMembers,
  getClassroom,
  getCompletedLessonIds,
  getCourse,
  getStats,
  isClassroomMember,
  listLessons,
  listModules,
  listOwnedCourses,
  unassignCourse,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const classroom = getClassroom(Number(id));
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = classroom.owner_id === user.id;
  if (!isOwner && !isClassroomMember(classroom.id, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assignments = classroomAssignments(classroom.id);
  const assignedLessonIds: number[] = [];
  for (const c of assignments) {
    for (const m of listModules(c.id)) {
      for (const l of listLessons(m.id)) assignedLessonIds.push(l.id);
    }
  }

  const members = classroomMembers(classroom.id).map((member) => {
    const completed = getCompletedLessonIds(member.user_id);
    const doneLessons = assignedLessonIds.filter((lid) => completed.has(lid)).length;
    const stats = getStats(member.user_id);
    return {
      user_id: member.user_id,
      name: member.name,
      doneLessons,
      totalLessons: assignedLessonIds.length,
      streak: stats.streak,
      total_xp: stats.total_xp,
    };
  });

  const weakConcepts = isOwner
    ? classWeakConcepts(
        members.map((m) => m.user_id),
        assignments.map((a) => a.id)
      )
    : [];

  return NextResponse.json({
    classroom: { ...classroom, isOwner },
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
    })),
    members,
    weakConcepts,
    // Teacher's publishable courses, for the assign dropdown
    myCourses: isOwner
      ? listOwnedCourses(user.id)
          .filter((c) => c.status === "ready")
          .map((c) => ({ id: c.id, title: c.title }))
      : [],
  });
}

/** Owner: assign or unassign a course. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const classroom = getClassroom(Number(id));
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (classroom.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the teacher can do this" }, { status: 403 });
  }
  const body = (await req.json()) as {
    courseId: number;
    action: "assign" | "unassign";
  };
  const course = getCourse(Number(body.courseId));
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  if (body.action === "assign") {
    // Teachers can assign their own courses or any published course
    if (course.owner_id !== user.id && !course.published) {
      return NextResponse.json(
        { error: "You can only assign your own or published courses" },
        { status: 403 }
      );
    }
    assignCourse(classroom.id, course.id);
  } else {
    unassignCourse(classroom.id, course.id);
  }
  return NextResponse.json({ ok: true });
}
