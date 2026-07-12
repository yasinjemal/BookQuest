import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAnswerOutboxAccount,
  flushCompletionOutbox,
  flushLearningOutbox,
  setAnswerOutboxAccount,
  submitAnswer,
  submitLessonCompletion,
} from "../lib/answer-outbox";

const COMPLETION_KEY = "bookquest.completion-outbox.v1.user-1";

// A working in-memory localStorage so queued items persist across calls, plus a
// window whose event API is a no-op. Mirrors what the browser gives the outbox.
function installBrowser(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

function queued(): unknown[] {
  return JSON.parse(localStorage.getItem(COMPLETION_KEY) ?? "[]");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  clearAnswerOutboxAccount();
  vi.unstubAllGlobals();
});

describe("lesson completion outbox", () => {
  it("delivers a completion online and returns the server result", async () => {
    installBrowser();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ xp: 15, stats: { streak: 3 }, certificate: null, duplicate: false })
    );
    vi.stubGlobal("fetch", fetchMock);
    setAnswerOutboxAccount(1);

    const result = await submitLessonCompletion({
      lessonId: 7,
      answerSessionId: "lesson_abc",
    });

    expect(result).toEqual({
      delivered: true,
      data: { xp: 15, stats: { streak: 3 }, certificate: null, duplicate: false },
    });
    // Delivery drains the queue. (Setting the account also kicks off a background
    // flush, so the completion endpoint may be hit more than once; the server
    // keys on the answer-session id and dedupes, so that is harmless.)
    expect(fetchMock).toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  it("queues a completion offline and delivers it on the next flush", async () => {
    installBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    setAnswerOutboxAccount(1);

    const first = await submitLessonCompletion({
      lessonId: 7,
      answerSessionId: "lesson_offline",
    });
    expect(first.delivered).toBe(false);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({
      accountId: 1,
      lessonId: 7,
      answerSessionId: "lesson_offline",
    });

    // Reconnect: the flush delivers it and clears the queue.
    const online = vi.fn(async () => jsonResponse({ xp: 10 }));
    vi.stubGlobal("fetch", online);
    await flushCompletionOutbox();

    expect(online).toHaveBeenCalledTimes(1);
    expect(queued()).toEqual([]);
  });

  it("keeps a completion queued while answers are still syncing (409)", async () => {
    installBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "evidence_pending" }, 409))
    );
    setAnswerOutboxAccount(1);

    const attempt = await submitLessonCompletion({
      lessonId: 7,
      answerSessionId: "lesson_pending",
    });
    expect(attempt.delivered).toBe(false);
    expect(queued()).toHaveLength(1); // transient — not discarded

    // Once the answers land, the same completion reconciles.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ xp: 12 })));
    await flushCompletionOutbox();
    expect(queued()).toEqual([]);
  });

  it("discards an unreconcilable completion (permanent 4xx)", async () => {
    installBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Not found" }, 404))
    );
    setAnswerOutboxAccount(1);

    const attempt = await submitLessonCompletion({
      lessonId: 999,
      answerSessionId: "lesson_gone",
    });

    expect(attempt.delivered).toBe(false);
    // Dropped rather than wedging the queue forever.
    expect(queued()).toEqual([]);
  });

  it("flushes answers before lesson completions", async () => {
    installBrowser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      })
    );
    setAnswerOutboxAccount(1);

    await submitAnswer({
      eventId: "evt_1",
      source: "lesson",
      sessionId: "lesson_x",
      lessonId: 7,
      cardIndex: 0,
      answer: 0,
      responseTimeMs: 100,
      occurredAt: new Date().toISOString(),
      attemptNumber: 1,
      hintCount: 0,
    });
    await submitLessonCompletion({ lessonId: 7, answerSessionId: "lesson_x" });

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({});
      })
    );
    await flushLearningOutbox();

    const answersIdx = calls.findIndex((url) => url.includes("/api/answers"));
    const completeIdx = calls.findIndex((url) => url.includes("/complete"));
    expect(answersIdx).toBeGreaterThanOrEqual(0);
    expect(completeIdx).toBeGreaterThan(answersIdx);
  });

  it("reports only aggregate queue health after replay", async () => {
    installBrowser();
    const beacons: Blob[] = [];
    vi.stubGlobal("navigator", {
      sendBeacon: (_url: string, body: Blob) => {
        beacons.push(body);
        return true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    setAnswerOutboxAccount(1);
    await submitAnswer({
      eventId: "private_event_id",
      source: "lesson",
      sessionId: "private_session_id",
      lessonId: 7,
      cardIndex: 0,
      answer: 0,
      responseTimeMs: 100,
      occurredAt: new Date().toISOString(),
      attemptNumber: 1,
      hintCount: 0,
    });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
    await flushLearningOutbox();

    expect(beacons).toHaveLength(1);
    const payload = await beacons[0].text();
    expect(JSON.parse(payload)).toMatchObject({
      answerQueueDepth: 0,
      completionQueueDepth: 0,
      attempted: 1,
      drained: 1,
    });
    expect(payload).not.toContain("private_event_id");
    expect(payload).not.toContain("private_session_id");
    expect(payload).not.toContain('"answer"');
  });
});
