export const SIGHTLINE_MODES = ["off", "horizon", "passage"] as const;
export type SightlineMode = (typeof SIGHTLINE_MODES)[number];

export const VOYAGE_GOALS = ["open", 25, 45, 60] as const;
export type VoyageGoal = "open" | 10 | 25 | 45 | 60;
export const ACTIVE_READING_WINDOW_MS = 90_000;

export interface QuestMark {
  id: string;
  unitIndex: number;
  unitTitle: string;
  passageId: string;
  excerpt: string;
  createdAt: string;
}

export function isSightlineMode(value: unknown): value is SightlineMode {
  return typeof value === "string" && SIGHTLINE_MODES.includes(value as SightlineMode);
}

export function voyageGoalMilliseconds(goal: VoyageGoal) {
  return goal === "open" ? null : goal * 60_000;
}

export function voyageProgress(elapsedMilliseconds: number, goal: VoyageGoal) {
  const target = voyageGoalMilliseconds(goal);
  if (!target) return 0;
  return Math.min(100, Math.max(0, elapsedMilliseconds / target * 100));
}

export function formatVoyageElapsed(elapsedMilliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMilliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function voyageRemainingLabel(elapsedMilliseconds: number, goal: VoyageGoal) {
  const target = voyageGoalMilliseconds(goal);
  if (!target) return "Open destination";
  const remainingMinutes = Math.max(0, Math.ceil((target - elapsedMilliseconds) / 60_000));
  return remainingMinutes > 0 ? `${remainingMinutes} min to harbor` : "Next passage is your harbor";
}

export function shouldOpenRestHarbor(goalPassageId: string | null, activePassageId: string | null) {
  return Boolean(goalPassageId && activePassageId && goalPassageId !== activePassageId);
}

export function activeReadingDelta(
  frameDeltaMilliseconds: number,
  options: { visible: boolean; dialogOpen: boolean; idleMilliseconds: number }
) {
  if (!options.visible || options.dialogOpen || options.idleMilliseconds > ACTIVE_READING_WINDOW_MS) return 0;
  return Math.min(2_000, Math.max(0, frameDeltaMilliseconds));
}

export function sanitizeQuestMarks(value: unknown): QuestMark[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: QuestMark[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const mark = candidate as Partial<QuestMark>;
    if (
      typeof mark.id !== "string" || !mark.id || seen.has(mark.id)
      || !Number.isInteger(mark.unitIndex) || Number(mark.unitIndex) < 0
      || typeof mark.unitTitle !== "string" || !mark.unitTitle.trim()
      || typeof mark.passageId !== "string" || !mark.passageId.startsWith("passage-")
      || typeof mark.excerpt !== "string" || !mark.excerpt.trim()
      || typeof mark.createdAt !== "string" || !Number.isFinite(Date.parse(mark.createdAt))
    ) continue;
    seen.add(mark.id);
    result.push({
      id: mark.id,
      unitIndex: Number(mark.unitIndex),
      unitTitle: mark.unitTitle.trim().slice(0, 240),
      passageId: mark.passageId,
      excerpt: mark.excerpt.replace(/\s+/gu, " ").trim().slice(0, 240),
      createdAt: mark.createdAt,
    });
    if (result.length >= 200) break;
  }
  return result;
}
