"use client";

import { CHANNEL_PACKAGE_SCHEMA, type ChannelCoursePackage } from "./channel-package";

const DATABASE_NAME = "bookquest-offline-courses-v1";
const STORE_NAME = "account-packages";
export const OFFLINE_CACHE_EVENT = "bookquest:offline-course-cache";

interface CachedCourseRecord {
  key: string;
  accountId: number;
  courseId: number;
  version: number;
  savedAt: string;
  coursePackage: ChannelCoursePackage;
}

export function offlineCourseCacheKey(accountId: number, courseId: number): string {
  return `account-${accountId}:course-${courseId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Offline storage is unavailable"));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("accountId", "accountId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed"));
  });
}

function notify() {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(OFFLINE_CACHE_EVENT));
  }
}

export async function saveCourseOffline(accountId: number, courseId: number) {
  if (!Number.isInteger(accountId) || accountId <= 0) throw new Error("Sign in before saving a course");
  const response = await fetch(`/api/courses/${courseId}/offline-package`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not build the offline course");
  const coursePackage = result as ChannelCoursePackage;
  if (coursePackage.schema !== CHANNEL_PACKAGE_SCHEMA || coursePackage.course.id !== courseId) {
    throw new Error("The offline course package is invalid");
  }
  const record: CachedCourseRecord = {
    key: offlineCourseCacheKey(accountId, courseId),
    accountId,
    courseId,
    version: coursePackage.course.version,
    savedAt: new Date().toISOString(),
    coursePackage,
  };
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
  } finally {
    database.close();
  }
  notify();
  return { version: record.version, savedAt: record.savedAt };
}

export async function getOfflineCourseStatus(accountId: number, courseId: number) {
  if (!Number.isInteger(accountId) || accountId <= 0 || typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  try {
    const record = await requestResult(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME)
        .get(offlineCourseCacheKey(accountId, courseId))
    ) as CachedCourseRecord | undefined;
    return record ? { version: record.version, savedAt: record.savedAt } : null;
  } finally {
    database.close();
  }
}

/** Shared-device safety: signing out removes every account-bound package from this browser. */
export async function clearOfflineCourseCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear());
  } finally {
    database.close();
  }
  notify();
}
