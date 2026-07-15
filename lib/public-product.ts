import { many, one, q } from "./pg";
import { canAccessCourse, getCourse } from "./db";
import { parseCourseAppearance } from "./course-appearance";

export class PublicProductError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export type PublicEventType = "view" | "share" | "reader_open";
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

interface PublicCourseRow {
  id: number; title: string; description: string; category: string; public_slug: string;
  appearance_json: string; created_at: string; creator_name: string;
  creator_slug: string | null; creator_headline: string; learner_count: number;
}
interface AnalyticsCourseRow {
  id: number; title: string; public_slug: string; published: number;
  enrollments: number; started: number; completions: number; views: number; shares: number; reader_opens: number;
}

export async function getPublicCourseBySlug(slug: string) {
  const course = await one<PublicCourseRow>(
    `SELECT c.id, c.title, c.description, c.category, c.public_slug, c.appearance_json,
            c.created_at, u.name AS creator_name,
            CASE WHEN u.creator_public THEN u.creator_slug ELSE NULL END AS creator_slug,
            CASE WHEN u.creator_public THEN u.creator_headline ELSE '' END AS creator_headline,
            (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS learner_count
     FROM courses c JOIN users u ON u.id = c.owner_id
     WHERE lower(c.public_slug) = lower($1) AND c.published = 1 AND c.status = 'ready'
       AND u.account_status = 'active'`, [slug]);
  if (!course) return undefined;
  const modules = await many<{ id: number; title: string; summary: string; position: number }>(
    `SELECT id, title, summary, position FROM modules WHERE course_id = $1 ORDER BY position`, [course.id]);
  const lessons = await many<{ id: number; module_id: number; title: string; position: number; card_count: number }>(
    `SELECT l.id, l.module_id, l.title, l.position,
            jsonb_array_length(l.cards::jsonb)::int AS card_count
     FROM lessons l JOIN modules m ON m.id = l.module_id
     WHERE m.course_id = $1 ORDER BY m.position, l.position`, [course.id]);
  return {
    ...course,
    appearance: parseCourseAppearance(String(course.appearance_json ?? "{}")),
    appearance_json: undefined,
    lesson_count: lessons.length,
    modules: modules.map((module) => ({
      ...module,
      lessons: lessons.filter((lesson) => lesson.module_id === module.id).map(({ module_id: _moduleId, ...lesson }) => lesson),
    })),
  };
}

export async function recordPublicCourseEvent(slug: string, eventType: PublicEventType) {
  const result = await q(
    `INSERT INTO public_course_events (course_id, event_type)
     SELECT id, $2 FROM courses WHERE lower(public_slug) = lower($1) AND published = 1 AND status = 'ready'`,
    [slug, eventType]);
  return result.rowCount === 1;
}

export async function recordCourseEvent(courseId: number, eventType: PublicEventType) {
  await q("INSERT INTO public_course_events (course_id, event_type) VALUES ($1, $2)", [courseId, eventType]);
}

export async function getCreatorProfile(userId: number) {
  return one<{ creator_slug: string; creator_headline: string; creator_bio: string; creator_public: boolean }>(
    `SELECT creator_slug, creator_headline, creator_bio, creator_public FROM users WHERE id = $1`, [userId]);
}

export async function updateCreatorProfile(userId: number, input: { slug: string; headline: string; bio: string; isPublic: boolean }) {
  const slug = input.slug.trim().toLowerCase();
  const headline = input.headline.trim();
  const bio = input.bio.trim();
  if (!SLUG.test(slug)) throw new PublicProductError("Use 3–40 lowercase letters, numbers, or hyphens for your profile address.");
  if (headline.length > 120 || bio.length > 600) throw new PublicProductError("Profile text is too long.");
  try {
    return await one(
      `UPDATE users SET creator_slug = $2, creator_headline = $3, creator_bio = $4, creator_public = $5
       WHERE id = $1 RETURNING creator_slug, creator_headline, creator_bio, creator_public`,
      [userId, slug, headline, bio, input.isPublic]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new PublicProductError("That profile address is already taken.", 409);
    throw error;
  }
}

export async function getPublicCreator(slug: string) {
  const creator = await one<{ id: number; name: string; creator_slug: string; creator_headline: string; creator_bio: string }>(
    `SELECT id, name, creator_slug, creator_headline, creator_bio
     FROM users WHERE lower(creator_slug) = lower($1) AND creator_public = TRUE AND account_status = 'active'`, [slug]);
  if (!creator) return undefined;
  const courses = await many<{ id: number; title: string; description: string; category: string; public_slug: string; appearance_json: string; learner_count: number }>(
    `SELECT id, title, description, category, public_slug, appearance_json,
            (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS learner_count
     FROM courses c WHERE owner_id = $1 AND published = 1 AND status = 'ready' ORDER BY created_at DESC`, [creator.id]);
  return { ...creator, id: undefined, courses: courses.map((course) => ({ ...course, appearance: parseCourseAppearance(String(course.appearance_json ?? "{}")), appearance_json: undefined })) };
}

export async function listPublicSeoEntries() {
  const [courses, creators] = await Promise.all([
    many<{ slug: string; created_at: string }>(
      `SELECT c.public_slug AS slug, c.created_at
       FROM courses c JOIN users u ON u.id = c.owner_id
       WHERE c.published = 1 AND c.status = 'ready' AND u.account_status = 'active'
       ORDER BY c.created_at DESC`
    ),
    many<{ slug: string; created_at: string }>(
      `SELECT u.creator_slug AS slug, u.created_at
       FROM users u
       WHERE u.creator_public = TRUE AND u.account_status = 'active'
       ORDER BY u.created_at DESC`
    ),
  ]);
  return {
    courses: courses.map((course) => ({ slug: course.slug, createdAt: course.created_at })),
    creators: creators.map((creator) => ({ slug: creator.slug, createdAt: creator.created_at })),
  };
}

export async function getCreatorAnalytics(userId: number) {
  const courses = await many<AnalyticsCourseRow>(
    `SELECT c.id, c.title, c.public_slug, c.published,
       (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.user_id <> $1) AS enrollments,
       (SELECT COUNT(DISTINCT p.user_id)::int FROM progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id AND p.user_id <> $1) AS started,
       (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.user_id <> $1
          AND (SELECT COUNT(DISTINCT p.lesson_id) FROM progress p JOIN lessons pl ON pl.id = p.lesson_id JOIN modules pm ON pm.id = pl.module_id WHERE p.user_id = e.user_id AND pm.course_id = c.id)
            >= (SELECT COUNT(*) FROM lessons cl JOIN modules cm ON cm.id = cl.module_id WHERE cm.course_id = c.id)
          AND (SELECT COUNT(*) FROM lessons cl JOIN modules cm ON cm.id = cl.module_id WHERE cm.course_id = c.id) > 0) AS completions,
       (SELECT COUNT(*)::int FROM public_course_events x WHERE x.course_id = c.id AND x.event_type = 'view') AS views,
       (SELECT COUNT(*)::int FROM public_course_events x WHERE x.course_id = c.id AND x.event_type = 'share') AS shares,
       (SELECT COUNT(*)::int FROM public_course_events x WHERE x.course_id = c.id AND x.event_type = 'reader_open') AS reader_opens
     FROM courses c WHERE c.owner_id = $1 ORDER BY c.created_at DESC`, [userId]);
  return { courses, totals: courses.reduce((sum, course) => ({
    views: sum.views + Number(course.views), shares: sum.shares + Number(course.shares),
    enrollments: sum.enrollments + Number(course.enrollments), started: sum.started + Number(course.started), completions: sum.completions + Number(course.completions),
    readerOpens: sum.readerOpens + Number(course.reader_opens),
  }), { views: 0, shares: 0, enrollments: 0, started: 0, completions: 0, readerOpens: 0 }) };
}

function readableChapters(content: unknown) {
  if (Array.isArray(content)) return content.map((item, index) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : undefined;
    const title = String(value?.title ?? value?.heading ?? `Section ${index + 1}`);
    const raw = value?.text ?? value?.body ?? value?.content ?? item ?? "";
    return { title, text: typeof raw === "string" ? raw : JSON.stringify(raw, null, 2) };
  });
  if (content && typeof content === "object") return Object.entries(content as Record<string, unknown>).map(([title, raw]) => ({ title, text: typeof raw === "string" ? raw : JSON.stringify(raw, null, 2) }));
  return [{ title: "Document", text: String(content ?? "") }];
}

export async function getCourseReader(userId: number, courseId: number) {
  const course = await getCourse(courseId);
  if (!course || !(await canAccessCourse(userId, courseId))) throw new PublicProductError("Course not found", 404);
  const versionId = course.owner_id === userId ? (course.current_draft_version_id ?? course.published_version_id) : course.published_version_id;
  if (!versionId) throw new PublicProductError("This course does not have a readable document yet.", 404);
  const rows = await many<{ title: string; source_version_id: string; extracted_content_json: string | null }>(
    `SELECT source.title, version.id AS source_version_id, version.extracted_content_json
     FROM course_version_sources link JOIN source_versions version ON version.id = link.source_version_id
     JOIN source_assets source ON source.id = version.source_id
     WHERE link.course_version_id = $1 ORDER BY link.position`, [versionId]);
  return { course: { id: course.id, title: course.title }, documents: rows.map((row) => ({
    title: row.title, sourceVersionId: row.source_version_id,
    chapters: readableChapters(row.extracted_content_json ? JSON.parse(row.extracted_content_json) : []),
  })) };
}
