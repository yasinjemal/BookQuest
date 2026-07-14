import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let qti: typeof import("../lib/qti");
let ownerId: number;
let outsiderId: number;
let courseId: number;

const ITEM_NS = "http://www.imsglobal.org/xsd/imsqtiasi_v3p0";
const MANIFEST_NS = "http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1";

function packageWith(items: Record<string, string>) {
  const resources = Object.keys(items).map((href, index) =>
    `<resource identifier="R${index}" type="imsqti_item_xmlv3p0" href="${href}"><file href="${href}"/></resource>`).join("");
  const manifest = `<manifest xmlns="${MANIFEST_NS}" identifier="M"><metadata><schema>QTI Item Bank</schema><schemaversion>3.0.0</schemaversion></metadata><organizations/><resources>${resources}</resources></manifest>`;
  return zipSync({
    "imsmanifest.xml": strToU8(manifest),
    ...Object.fromEntries(Object.entries(items).map(([name, value]) => [name, strToU8(value)])),
  });
}

function choiceItem(identifier: string, maxChoices = "1") {
  return `<qti-assessment-item xmlns="${ITEM_NS}" identifier="${identifier}" title="Question" adaptive="false" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier"><qti-correct-response><qti-value>A</qti-value></qti-correct-response></qti-response-declaration><qti-item-body><qti-choice-interaction response-identifier="RESPONSE" max-choices="${maxChoices}"><qti-prompt>Which action is correct?</qti-prompt><qti-simple-choice identifier="A">Open safely</qti-simple-choice><qti-simple-choice identifier="B">Skip checks</qti-simple-choice></qti-choice-interaction></qti-item-body><qti-response-processing template="https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct"/></qti-assessment-item>`;
}

describe.skipIf(!TEST_DB)("QTI 3.0 item bank exchange", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    studio = await import("../lib/studio");
    qti = await import("../lib/qti");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("qti-owner@example.test", "QTI Owner", "hash")).id;
    outsiderId = (await db.createUser("qti-outsider@example.test", "QTI Outsider", "hash")).id;
    const spaceId = (await spaces.createSpace(ownerId, { name: "QTI Workspace", type: "organization" })).space.id;
    const source = await studio.createTextSource(ownerId, spaceId, {
      title: "Assessment source", kind: "manual",
      content: [{ title: "Checks", text: "Open safely and verify the checklist." }],
    });
    const course = await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "QTI exchange sample", sourceVersionIds: [source.sourceVersionId],
    });
    courseId = course.courseId;
    const common = {
      moduleKey: "module:assessment", moduleTitle: "Assessment", moduleSummary: "",
      lessonKey: "lesson:assessment", lessonTitle: "Knowledge check",
      modulePosition: 0, lessonPosition: 0,
    };
    await studio.addCourseBlock(ownerId, courseId, {
      ...common, blockType: "multiple_choice",
      content: { type: "multiple_choice", question: "Which action is correct?", options: ["Open safely", "Skip checks"], correctIndex: 0, explanation: "Open safely." },
    });
    await studio.addCourseBlock(ownerId, courseId, {
      ...common, blockType: "true_false",
      content: { type: "true_false", statement: "The checklist is required.", answer: true, explanation: "The checklist is required." },
    });
    await studio.addCourseBlock(ownerId, courseId, {
      ...common, blockType: "fill_in",
      content: { type: "fill_in", prompt: "Name the required record.", answer: "checklist", acceptedAnswers: [], explanation: "Use the checklist." },
    });
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("round-trips the supported QTI 3.0 item subset with provenance", async () => {
    const exported = await qti.exportQti3ItemBank(ownerId, courseId);
    expect(exported).toMatchObject({ profile: "bookquest-qti-3.0-item-bank-v1", itemCount: 3 });
    const parsed = qti.parseQti3ItemBank(exported.bytes);
    expect(parsed.items.map((item) => item.blockType)).toEqual(["multiple_choice", "true_false", "fill_in"]);
    const imported = await qti.importQti3ItemBank(ownerId, courseId, exported.bytes);
    expect(imported).toMatchObject({ profile: "bookquest-qti-3.0-item-bank-v1", itemCount: 3 });
    expect(imported.blocks).toHaveLength(3);
    const provenance = await pg.q<{ provenance_json: string; edit_origin: string }>(
      `SELECT revision.provenance_json,revision.edit_origin
       FROM course_block_revisions revision
       WHERE revision.block_id=ANY($1::text[])`,
      [imported.blocks.map((block) => block.id)],
    );
    expect(provenance.rows.every((row) => row.edit_origin === "imported"
      && JSON.parse(row.provenance_json).format === "QTI 3.0")).toBe(true);
    const beforeRetry = (await studio.getCourseStudio(ownerId, courseId)).blocks.length;
    await expect(qti.importQti3ItemBank(ownerId, courseId, exported.bytes))
      .rejects.toThrow(/already imported/i);
    expect((await studio.getCourseStudio(ownerId, courseId)).blocks).toHaveLength(beforeRetry);
  });

  it("denies export and import outside the owning Space", async () => {
    await expect(qti.exportQti3ItemBank(outsiderId, courseId)).rejects.toThrow(/space access denied/i);
    await expect(qti.importQti3ItemBank(
      outsiderId,
      courseId,
      packageWith({ "items/one.xml": choiceItem("ONE") }),
    )).rejects.toThrow(/space access denied/i);
  });

  it("rejects dangerous, oversized and unsupported packages before any write", async () => {
    expect(() => qti.parseQti3ItemBank(zipSync({ "../imsmanifest.xml": strToU8("bad") })))
      .toThrow(/unsafe path/i);
    expect(() => qti.parseQti3ItemBank(packageWith({
      "items/one.xml": `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${choiceItem("ONE")}`,
    }))).toThrow(/prohibited declaration/i);
    expect(() => qti.parseQti3ItemBank(packageWith({
      "items/one.xml": choiceItem("ONE", "2"),
    }))).toThrow(/single-response/i);
    expect(() => qti.parseQti3ItemBank(zipSync({
      "imsmanifest.xml": new Uint8Array(5 * 1024 * 1024 + 1),
    }, { level: 9 }))).toThrow(/oversized/i);

    const before = (await studio.getCourseStudio(ownerId, courseId)).blocks.length;
    await expect(qti.importQti3ItemBank(ownerId, courseId, packageWith({
      "items/valid.xml": choiceItem("VALID"),
      "items/unsupported.xml": choiceItem("UNSUPPORTED", "2"),
    }))).rejects.toThrow(/single-response/i);
    expect((await studio.getCourseStudio(ownerId, courseId)).blocks).toHaveLength(before);
  });
});
