"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import {
  activeReadingDelta,
  formatVoyageElapsed,
  shouldOpenRestHarbor,
  voyageGoalMilliseconds,
  voyageProgress,
  voyageRemainingLabel,
  type VoyageGoal,
} from "@/lib/long-reading";
import styles from "./LongReadingDock.module.css";

export default function LongReadingDock({
  goal,
  activePassageId,
  passageLabel,
  marked,
  onToggleMark,
  onEnd,
  onHarbor,
}: {
  goal: VoyageGoal;
  activePassageId: string | null;
  passageLabel: string;
  marked: boolean;
  onToggleMark: () => void;
  onEnd: () => void;
  onHarbor: (activeMilliseconds: number) => void;
}) {
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);
  const [announcement, setAnnouncement] = useState("Voyage started. Only active reading time counts.");
  const lastActivity = useRef(0);
  const lastTick = useRef(0);
  const goalPassage = useRef<string | null>(null);
  const harborOpened = useRef(false);

  useEffect(() => {
    lastActivity.current = performance.now();
    lastTick.current = performance.now();
    const noteActivity = () => { lastActivity.current = performance.now(); };
    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, noteActivity, { passive: true }));
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = activeReadingDelta(now - lastTick.current, {
        visible: document.visibilityState === "visible",
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
        idleMilliseconds: now - lastActivity.current,
      });
      lastTick.current = now;
      if (delta <= 0) return;
      setElapsedMilliseconds((current) => current + delta);
    }, 1_000);
    return () => {
      window.clearInterval(timer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, noteActivity));
    };
  }, [activePassageId, goal]);

  useEffect(() => {
    const target = voyageGoalMilliseconds(goal);
    if (!target || elapsedMilliseconds < target || goalPassage.current) return;
    goalPassage.current = activePassageId;
    setAnnouncement("Voyage destination reached. Your next passage boundary is a natural stopping point.");
  }, [activePassageId, elapsedMilliseconds, goal]);

  useEffect(() => {
    if (harborOpened.current || !shouldOpenRestHarbor(goalPassage.current, activePassageId)) return;
    harborOpened.current = true;
    onHarbor(elapsedMilliseconds);
  }, [activePassageId, elapsedMilliseconds, onHarbor]);

  const progress = voyageProgress(elapsedMilliseconds, goal);
  const dialStyle = { "--voyage-progress": `${progress * 3.6}deg` } as CSSProperties;

  return (
    <div className={styles.card}>
      <div className={styles.dial} style={dialStyle}><span><strong>{formatVoyageElapsed(elapsedMilliseconds)}</strong><small>active</small></span></div>
      <p className={styles.eyebrow}><AppIcon name="compass" /> Lumen Voyage</p>
      <strong className={styles.passage}>{passageLabel}</strong>
      <span className={styles.destination}>{voyageRemainingLabel(elapsedMilliseconds, goal)}</span>
      <div className={styles.actions}>
        <button type="button" onClick={onToggleMark} aria-pressed={marked}><AppIcon name="bookmark" />{marked ? "Marked" : "Mark"}</button>
        <button type="button" onClick={onEnd}>End</button>
      </div>
      <small className={styles.note}>Hidden and idle time never count</small>
      <span className="screen-reader-text" role="status" aria-live="polite">{announcement}</span>
    </div>
  );
}
