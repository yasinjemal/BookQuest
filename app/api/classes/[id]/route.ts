import { NextRequest, NextResponse } from "next/server";
import {
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
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  assignLegacyClassroomCourse,
  unassignLegacyClassroomCourse,
} from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const classroom = await getClassroom(Number(id));
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = classroom.owner_id === user.id;
  if (!isOwner && !(await isClassroomMember(classroom.id, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assignments = await classroomAssignments(classroom.id);
  const assignedLessonIds: number[] = [];
  for (const c of assignments) {
    for (const m of await listModules(c.id)) {
      for (const l of await listLessons(m.id)) assignedLessonIds.push(l.id);
    }
  }

  const allMembers = await Promise.all(
    (await classroomMembers(classroom.id)).map(async (member) => {
      const completed = await getCompletedLessonIds(member.user_id);
      const doneLessons = assignedLessonIds.filter((lid) => completed.has(lid)).length;
      const stats = await getStats(member.user_id);
      return {
        user_id: member.user_id,
        name: member.name,
        doneLessons,
        totalLessons: assignedLessonIds.length,
        streak: stats.streak,
        total_xp: stats.total_xp,
      };
    })
  );

  // Learners can see only their own progress. Aggregate/member evidence belongs
  // to the teacher until Phase 1 introduces explicit manager/auditor roles.
  const members = isOwner
    ? allMembers
    : allMembers.filter((member) => member.user_id === user.id);

  const weakConcepts = isOwner
    ? await classWeakConcepts(
        allMembers.map((m) => m.user_id),
        assignments.map((a) => a.id)
      )
    : [];

  const myCourses = isOwner
    ? (await listOwnedCourses(user.id))
        .filter((c) => c.status === "ready")
        .map((c) => ({ id: c.id, title: c.title }))
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
    myCourses,
  });
}

/** Owner: assign or unassign a course. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const classroom = await getClassroom(Number(id));
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (classroom.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the teacher can do this" }, { status: 403 });
  }
  const body = (await req.json()) as {
    courseId: number;
    action: "assign" | "unassign";
  };
  const course = await getCourse(Number(body.courseId));
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  if (body.action === "assign") {
    if (course.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Copy a public course into your own library before assigning it" },
        { status: 403 }
      );
    }
    await assignLegacyClassroomCourse(user.id, classroom.id, course.id);
  } else {
    await unassignLegacyClassroomCourse(user.id, classroom.id, course.id);
  }
  return NextResponse.json({ ok: true });
}
