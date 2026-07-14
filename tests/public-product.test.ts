import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let product: typeof import("../lib/public-product");
let ownerId: number;
let outsiderId: number;
let courseId: number;
let publicSlug: string;

describe.skipIf(!TEST_DB)("public launch product contracts", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg"); db = await import("../lib/db"); product = await import("../lib/public-product");
    await pg.ready(); await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("creator@example.test", "Blacksteel Academy", "hash")).id;
    outsiderId = (await db.createUser("outsider@example.test", "Outside Learner", "hash")).id;
    const created = await db.createCourse(ownerId, "shop-playbook.pdf"); courseId = created.id;
    await db.setCourseSource(courseId, JSON.stringify([{ title: "Opening the shop", text: "Check the alarm, till, and fitting rooms." }]));
    await db.setCourseMeta(courseId, "The Blacksteel Shop Playbook", "Practical onboarding and workplace procedures.", created.generationRunId);
    await pg.q("UPDATE courses SET status = 'ready' WHERE id = $1", [courseId]);
    await db.createModule(courseId, "Start the day", "Open safely and consistently.", 1, undefined, created.generationRunId);
    const module = await pg.one<{ id: number }>("SELECT id FROM modules WHERE course_id = $1", [courseId]);
    await pg.q("INSERT INTO lessons (module_id, title, position, cards, generation_run_id) VALUES ($1, 'Opening checklist', 1, $2, $3)", [module!.id, JSON.stringify([{ type: "concept", title: "Opening safely", body: "Follow the checklist." }]), created.generationRunId]);
    publicSlug = String((await db.getCourse(courseId))!.public_slug);
  });
  afterAll(async () => { await pg?.pool.end(); delete process.env.DATABASE_URL; });

  it("does not expose drafts and exposes only a published outline—not source text", async () => {
    expect(await product.getPublicCourseBySlug(publicSlug)).toBeUndefined();
    await db.setCoursePublished(courseId, true, "Business");
    const page = await product.getPublicCourseBySlug(publicSlug);
    expect(page).toMatchObject({ title: "The Blacksteel Shop Playbook", lesson_count: 1 });
    expect(JSON.stringify(page)).not.toContain("Check the alarm");
  });

  it("keeps creator pages private until explicit opt-in and validates stable slugs", async () => {
    const initial = await product.getCreatorProfile(ownerId);
    expect(await product.getPublicCreator(initial!.creator_slug)).toBeUndefined();
    await expect(product.updateCreatorProfile(ownerId, { slug: "Bad slug", headline: "", bio: "", isPublic: true })).rejects.toThrow(/lowercase/);
    await product.updateCreatorProfile(ownerId, { slug: "blacksteel-academy", headline: "Workplace learning made clear", bio: "Practical training for growing teams.", isPublic: true });
    const creator = await product.getPublicCreator("blacksteel-academy");
    expect(creator?.courses).toHaveLength(1);
  });

  it("stores anonymous aggregate events without a visitor identifier and scopes analytics to the owner", async () => {
    await product.recordPublicCourseEvent(publicSlug, "view"); await product.recordPublicCourseEvent(publicSlug, "share");
    const analytics = await product.getCreatorAnalytics(ownerId);
    expect(analytics.totals).toMatchObject({ views: 1, shares: 1 });
    const columns = await pg.many<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'public_course_events'");
    expect(columns.map((row) => row.column_name)).not.toContain("visitor_id");
    expect((await product.getCreatorAnalytics(outsiderId)).courses).toHaveLength(0);
  });

  it("blocks an outsider from a private reader and permits owner/participant access", async () => {
    await db.setCoursePublished(courseId, false, "Business");
    await expect(product.getCourseReader(outsiderId, courseId)).rejects.toMatchObject({ status: 404 });
    const ownerReader = await product.getCourseReader(ownerId, courseId);
    expect(ownerReader.documents[0].chapters[0].text).toContain("Check the alarm");
    await pg.q("UPDATE courses SET published_version_id = current_draft_version_id WHERE id = $1", [courseId]);
    await db.setCoursePublished(courseId, true, "Business");
    const learnerReader = await product.getCourseReader(outsiderId, courseId);
    expect(learnerReader.documents).toHaveLength(1);
  });
});
