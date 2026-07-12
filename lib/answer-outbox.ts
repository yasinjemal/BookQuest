"use client";

const ACCOUNT_KEY = "bookquest.answer-account.v1";
const STORAGE_PREFIX = "bookquest.answer-outbox.v2";

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
  void flushAnswerOutbox();
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
}

function readOutbox(accountId: number): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(accountId)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(accountId: number, items: OutboxItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(accountId), JSON.stringify(items));
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
  void flushAnswerOutbox();
  if (listening || typeof window === "undefined") return () => undefined;
  listening = true;
  const onOnline = () => void flushAnswerOutbox();
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("online", onOnline);
    listening = false;
  };
}
