"use client";

const ACCOUNT_KEY = "bookquest.answer-account.v1";
const STORAGE_PREFIX = "bookquest.answer-outbox.v2";
export const LEARNING_OUTBOX_STATUS_EVENT = "bookquest:learning-outbox-status";

export interface LearningOutboxStatus {
  accountId: number | undefined;
  answerCount: number;
  completionCount: number;
  pendingCount: number;
  online: boolean;
}

export type AnswerOutboxPayload = Record<string, unknown> & { eventId: string };

interface OutboxItem {
  accountId: number;
  eventId: string;
  body: AnswerOutboxPayload;
  queuedAt: string;
}

const flushes = new Map<number, Promise<void>>();
let listening = false;
let memoryAccountId: number | undefined;

function emitOutboxStatus() {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(LEARNING_OUTBOX_STATUS_EVENT));
  }
}

function currentAccountId(): number | undefined {
  if (memoryAccountId) return memoryAccountId;
  if (typeof window === "undefined") return undefined;
  try {
    const value = Number(localStorage.getItem(ACCOUNT_KEY));
    memoryAccountId =
      Number.isInteger(value) && value > 0 ? value : undefined;
  } catch {
    memoryAccountId = undefined;
  }
  return memoryAccountId;
}

function storageKey(accountId: number): string {
  return `${STORAGE_PREFIX}.user-${accountId}`;
}

export function setAnswerOutboxAccount(accountId: number) {
  if (typeof window === "undefined" || !Number.isInteger(accountId) || accountId <= 0) {
    return;
  }
  memoryAccountId = accountId;
  try {
    localStorage.setItem(ACCOUNT_KEY, String(accountId));
  } catch {
    console.warn("Account scope will remain in memory for this session.");
  }
  emitOutboxStatus();
  void flushLearningOutbox();
}

export function clearAnswerOutboxAccount() {
  memoryAccountId = undefined;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      // The in-memory scope is still cleared.
    }
  }
  emitOutboxStatus();
}

function readStoredList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeStoredList<T>(key: string, items: T[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(items));
}

function readOutbox(accountId: number): OutboxItem[] {
  return readStoredList<OutboxItem>(storageKey(accountId));
}

function writeOutbox(accountId: number, items: OutboxItem[]) {
  writeStoredList(storageKey(accountId), items);
  emitOutboxStatus();
}

function enqueue(accountId: number, body: AnswerOutboxPayload) {
  const items = readOutbox(accountId);
  if (items.some((item) => item.eventId === body.eventId)) return;
  items.push({
    accountId,
    eventId: body.eventId,
    body,
    queuedAt: new Date().toISOString(),
  });
  writeOutbox(accountId, items);
}

function remove(accountId: number, eventId: string) {
  writeOutbox(
    accountId,
    readOutbox(accountId).filter((item) => item.eventId !== eventId)
  );
}

async function deliver(item: OutboxItem): Promise<boolean> {
  const response = await fetch("/api/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item.body),
  });
  // A conflict is permanent and must not retry forever. Normal duplicates are 200.
  if (response.ok || response.status === 409) return true;
  // Validation/auth/not-found failures cannot be repaired by reconnecting.
  if (
    response.status >= 400 &&
    response.status < 500 &&
    ![401, 403, 429].includes(response.status)
  ) {
    console.warn("Discarding invalid queued learning event", item.eventId);
    return true;
  }
  return false;
}

export async function submitAnswer(body: AnswerOutboxPayload): Promise<void> {
  const accountId = currentAccountId();
  if (!accountId) {
    console.error("Learning answer could not be queued without an account scope");
    return;
  }
  const scopedBody: AnswerOutboxPayload = { ...body, accountId };
  // Queue first. If navigation interrupts the request, reconnect will replay the
  // same idempotent event rather than silently losing a non-backfillable answer.
  try {
    enqueue(accountId, scopedBody);
  } catch (error) {
    console.error("Learning answer outbox storage failed", error);
  }
  try {
    if (
      await deliver({
        accountId,
        eventId: body.eventId,
        body: scopedBody,
        queuedAt: new Date().toISOString(),
      })
    ) {
      remove(accountId, body.eventId);
    }
  } catch {
    // The durable local copy remains queued for the next online flush.
  }
}

export function flushAnswerOutbox(): Promise<void> {
  const accountId = currentAccountId();
  if (!accountId) return Promise.resolve();
  const active = flushes.get(accountId);
  if (active) return active;
  const flushing = (async () => {
    for (const item of readOutbox(accountId)) {
      try {
        if (item.accountId !== accountId) break;
        if (await deliver(item)) remove(accountId, item.eventId);
        else break;
      } catch {
        break;
      }
    }
  })().finally(() => {
    flushes.delete(accountId);
  });
  flushes.set(accountId, flushing);
  return flushing;
}

export function startAnswerOutboxSync(): () => void {
  void flushLearningOutbox();
  if (listening || typeof window === "undefined") return () => undefined;
  listening = true;
  const onOnline = () => void flushLearningOutbox();
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("online", onOnline);
    listening = false;
  };
}

// ---------- Lesson completion outbox ----------
// A finished lesson is reconciled against its recorded answers on the server, so
// a completion queued offline can only succeed once its answers have synced.
// These entries are therefore flushed *after* the answer outbox, and a 409
// ("evidence_pending") is treated as transient rather than a permanent failure.

const COMPLETION_PREFIX = "bookquest.completion-outbox.v1";

interface CompletionOutboxItem {
  accountId: number;
  lessonId: number;
  answerSessionId: string;
  queuedAt: string;
}

export interface LessonCompletionResult {
  xp: number;
  stats?: { streak: number; total_xp?: number };
  certificate?: { id: string } | null;
  duplicate?: boolean;
}

const completionFlushes = new Map<number, Promise<void>>();

function completionKey(accountId: number): string {
  return `${COMPLETION_PREFIX}.user-${accountId}`;
}

function readCompletions(accountId: number): CompletionOutboxItem[] {
  return readStoredList<CompletionOutboxItem>(completionKey(accountId));
}

function writeCompletions(accountId: number, items: CompletionOutboxItem[]) {
  writeStoredList(completionKey(accountId), items);
  emitOutboxStatus();
}

export function getLearningOutboxStatus(): LearningOutboxStatus {
  const accountId = currentAccountId();
  const answerCount = accountId ? readOutbox(accountId).length : 0;
  const completionCount = accountId ? readCompletions(accountId).length : 0;
  return {
    accountId,
    answerCount,
    completionCount,
    pendingCount: answerCount + completionCount,
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  };
}

function enqueueCompletion(accountId: number, item: CompletionOutboxItem) {
  const items = readCompletions(accountId);
  // The answer-session id is unique per lesson attempt, so it dedupes replays.
  if (items.some((queued) => queued.answerSessionId === item.answerSessionId)) return;
  items.push(item);
  writeCompletions(accountId, items);
}

function removeCompletion(accountId: number, answerSessionId: string) {
  writeCompletions(
    accountId,
    readCompletions(accountId).filter(
      (item) => item.answerSessionId !== answerSessionId
    )
  );
}

type CompletionDelivery =
  | { done: true; data: LessonCompletionResult }
  | { done: false; retry: boolean };

async function deliverCompletion(
  item: CompletionOutboxItem
): Promise<CompletionDelivery> {
  const response = await fetch(`/api/lessons/${item.lessonId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answerSessionId: item.answerSessionId }),
  });
  // The server keys completion on the answer-session id, so a replay of an
  // already-recorded completion returns 200 with duplicate: true — safe to drop.
  if (response.ok) {
    return { done: true, data: (await response.json()) as LessonCompletionResult };
  }
  // 409 = answers still syncing; 401/403/429 = auth/rate; 5xx = server. All
  // recoverable by retrying once the queue drains or the app reconnects.
  if (
    response.status === 409 ||
    [401, 403, 429].includes(response.status) ||
    response.status >= 500
  ) {
    return { done: false, retry: true };
  }
  // Other 4xx (lesson gone, malformed) cannot be repaired by reconnecting.
  console.warn("Discarding unreconcilable lesson completion", item.answerSessionId);
  return { done: false, retry: false };
}

/**
 * Record a finished lesson. Queues it durably first, then tries to deliver now:
 * on success returns the server result for the celebration screen; otherwise it
 * stays queued and reconciles on the next online flush (answers first).
 */
export async function submitLessonCompletion(input: {
  lessonId: number;
  answerSessionId: string;
}): Promise<{ delivered: boolean; data?: LessonCompletionResult }> {
  const accountId = currentAccountId();
  if (!accountId) {
    console.error("Lesson completion could not be queued without an account scope");
    return { delivered: false };
  }
  const item: CompletionOutboxItem = {
    accountId,
    lessonId: input.lessonId,
    answerSessionId: input.answerSessionId,
    queuedAt: new Date().toISOString(),
  };
  try {
    enqueueCompletion(accountId, item);
  } catch (error) {
    console.error("Lesson completion outbox storage failed", error);
  }
  try {
    const result = await deliverCompletion(item);
    if (result.done) {
      removeCompletion(accountId, item.answerSessionId);
      return { delivered: true, data: result.data };
    }
    // A permanent rejection must not linger in the queue forever.
    if (!result.retry) removeCompletion(accountId, item.answerSessionId);
    return { delivered: false };
  } catch {
    // Offline: the durable copy stays queued for the next online flush.
    return { delivered: false };
  }
}

export function flushCompletionOutbox(): Promise<void> {
  const accountId = currentAccountId();
  if (!accountId) return Promise.resolve();
  const active = completionFlushes.get(accountId);
  if (active) return active;
  const flushing = (async () => {
    for (const item of readCompletions(accountId)) {
      if (item.accountId !== accountId) break;
      try {
        const result = await deliverCompletion(item);
        // Delivered, or permanently rejected: drop it. Transient: stop and retry.
        if (result.done || !result.retry) {
          removeCompletion(accountId, item.answerSessionId);
        } else {
          break;
        }
      } catch {
        break; // offline — stop; the queue persists for the next online flush
      }
    }
  })().finally(() => {
    completionFlushes.delete(accountId);
  });
  completionFlushes.set(accountId, flushing);
  return flushing;
}

/**
 * Flush answers first — so a queued lesson completion's evidence reconciliation
 * can pass — then flush queued lesson completions.
 */
export function flushLearningOutbox(): Promise<void> {
  const accountId = currentAccountId();
  const beforeAnswers = accountId ? readOutbox(accountId) : [];
  const beforeCompletions = accountId ? readCompletions(accountId) : [];
  return flushAnswerOutbox()
    .then(() => flushCompletionOutbox())
    .then(() => {
      if (!accountId) return;
      const afterAnswers = readOutbox(accountId);
      const afterCompletions = readCompletions(accountId);
      const attempted = beforeAnswers.length + beforeCompletions.length;
      const remaining = afterAnswers.length + afterCompletions.length;
      if (attempted === 0 && remaining === 0) return;
      const oldestQueuedAt = [...afterAnswers, ...afterCompletions]
        .map((item) => Date.parse(item.queuedAt))
        .filter(Number.isFinite)
        .sort((a, b) => a - b)[0];
      const oldestQueueSeconds = oldestQueuedAt
        ? Math.max(0, Math.min(30 * 86_400, Math.trunc((Date.now() - oldestQueuedAt) / 1000)))
        : 0;
      reportOutboxHealth({
        answerQueueDepth: afterAnswers.length,
        completionQueueDepth: afterCompletions.length,
        oldestQueueSeconds,
        attempted,
        drained: Math.max(0, attempted - remaining),
      });
    })
    .finally(() => {
      emitOutboxStatus();
    });
}

interface OutboxHealthTelemetry {
  answerQueueDepth: number;
  completionQueueDepth: number;
  oldestQueueSeconds: number;
  attempted: number;
  drained: number;
}

/** Best-effort aggregate telemetry. Cookies authenticate the beacon; no account,
 * event, course, lesson, answer or session identifier is included in the body. */
function reportOutboxHealth(telemetry: OutboxHealthTelemetry) {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }
  try {
    navigator.sendBeacon(
      "/api/telemetry/outbox",
      new Blob([JSON.stringify(telemetry)], { type: "application/json" })
    );
  } catch {
    // Monitoring is deliberately best-effort and must never block learning.
  }
}
