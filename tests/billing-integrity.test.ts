import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

let billing: typeof import("../lib/billing");
let data: typeof import("../lib/db");
let pg: typeof import("../lib/pg");
let userId: number;

describe.skipIf(!TEST_DB)("billing fulfillment integrity", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    data = await import("../lib/db");
    billing = await import("../lib/billing");
    await pg.ready();
    await pg.q(`TRUNCATE
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      operational_events, rate_limit_buckets, privacy_actions, consent_records,
      account_tokens, sessions, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);
    userId = (await data.createUser("billing@example.com", "Buyer", "hash")).id;
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("grants a verified product exactly once under concurrent callbacks", async () => {
    await data.createTransaction(userId, "billing-race", "credits_5", 299, "USD");
    await Promise.all([
      billing.fulfill("billing-race", "provider-a"),
      billing.fulfill("billing-race", "provider-b"),
      billing.fulfill("billing-race", "provider-c"),
    ]);
    expect((await data.getUserById(userId))!.credits).toBe(8);
    const transaction = await data.getTransaction("billing-race");
    expect(transaction?.status).toBe("successful");
    expect(["provider-a", "provider-b", "provider-c"]).toContain(
      transaction?.provider_ref
    );
  });

  it("cannot downgrade a successful payment after a failed verification", async () => {
    await data.markTransaction("billing-race", "failed", "late-failure");
    expect(await data.getTransaction("billing-race")).toMatchObject({
      status: "successful",
    });
    expect((await data.getUserById(userId))!.credits).toBe(8);
  });
});
