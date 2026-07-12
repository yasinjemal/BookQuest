import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAnswerOutboxAccount,
  setAnswerOutboxAccount,
  submitAnswer,
} from "../lib/answer-outbox";

afterEach(() => {
  clearAnswerOutboxAccount();
  vi.unstubAllGlobals();
});

describe("account-scoped answer outbox", () => {
  it("still delivers online when durable browser storage is unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
      removeItem: () => {
        throw new Error("storage blocked");
      },
    });
    const requests: RequestInit[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init) requests.push(init);
        return new Response("{}", { status: 200 });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(() => setAnswerOutboxAccount(42)).not.toThrow();
    await submitAnswer({
      eventId: "event_storage_blocked",
      source: "lesson",
      sessionId: "lesson_session_123",
      lessonId: 1,
      cardIndex: 0,
      answer: 0,
      responseTimeMs: 1000,
      occurredAt: new Date().toISOString(),
      attemptNumber: 1,
      hintCount: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = requests[0];
    expect(JSON.parse(String(request.body))).toMatchObject({
      accountId: 42,
      eventId: "event_storage_blocked",
    });
  });
});
