import { describe, expect, it } from "vitest";
import {
  activeReadingDelta,
  formatVoyageElapsed,
  isSightlineMode,
  sanitizeQuestMarks,
  shouldOpenRestHarbor,
  voyageGoalMilliseconds,
  voyageProgress,
  voyageRemainingLabel,
} from "../lib/long-reading";

describe("Lumen Voyage", () => {
  it("models open and timed destinations without inflating progress", () => {
    expect(voyageGoalMilliseconds("open")).toBeNull();
    expect(voyageGoalMilliseconds(25)).toBe(1_500_000);
    expect(voyageProgress(750_000, 25)).toBe(50);
    expect(voyageProgress(2_000_000, 25)).toBe(100);
    expect(voyageProgress(-50, 25)).toBe(0);
  });

  it("formats calm, human-readable session timing", () => {
    expect(formatVoyageElapsed(0)).toBe("0:00");
    expect(formatVoyageElapsed(65_900)).toBe("1:05");
    expect(voyageRemainingLabel(0, "open")).toBe("Open destination");
    expect(voyageRemainingLabel(24 * 60_000, 25)).toBe("1 min to harbor");
    expect(voyageRemainingLabel(25 * 60_000, 25)).toBe("Next passage is your harbor");
  });

  it("waits for a new passage before opening a rest harbor", () => {
    expect(shouldOpenRestHarbor(null, "passage-a")).toBe(false);
    expect(shouldOpenRestHarbor("passage-a", "passage-a")).toBe(false);
    expect(shouldOpenRestHarbor("passage-a", "passage-b")).toBe(true);
  });

  it("counts only bounded, visible, recently active reading time", () => {
    expect(activeReadingDelta(1_100, { visible: true, dialogOpen: false, idleMilliseconds: 10_000 })).toBe(1_100);
    expect(activeReadingDelta(20_000, { visible: true, dialogOpen: false, idleMilliseconds: 10_000 })).toBe(2_000);
    expect(activeReadingDelta(1_000, { visible: false, dialogOpen: false, idleMilliseconds: 0 })).toBe(0);
    expect(activeReadingDelta(1_000, { visible: true, dialogOpen: true, idleMilliseconds: 0 })).toBe(0);
    expect(activeReadingDelta(1_000, { visible: true, dialogOpen: false, idleMilliseconds: 91_000 })).toBe(0);
  });

  it("recognizes only supported Sightline modes", () => {
    expect(isSightlineMode("horizon")).toBe(true);
    expect(isSightlineMode("passage")).toBe(true);
    expect(isSightlineMode("dim-everything")).toBe(false);
  });

  it("sanitizes, deduplicates, and bounds device-local Quest Marks", () => {
    const valid = {
      id: "2:passage-abc-1",
      unitIndex: 2,
      unitTitle: "A chapter",
      passageId: "passage-abc-1",
      excerpt: "  A   remembered passage.  ",
      createdAt: "2026-07-20T08:00:00.000Z",
    };
    const marks = sanitizeQuestMarks([valid, valid, { ...valid, id: "bad", passageId: "unknown" }, null]);
    expect(marks).toEqual([{ ...valid, excerpt: "A remembered passage." }]);
  });
});
