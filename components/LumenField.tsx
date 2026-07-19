import type { CSSProperties } from "react";
import { stableReadingHash } from "@/lib/reading-content";
import styles from "./LumenField.module.css";

export default function LumenField({
  seed,
  progress,
  signal,
  enabled,
}: {
  seed: string;
  progress: number;
  signal: number;
  enabled: boolean;
}) {
  const hash = stableReadingHash(seed);
  const motes = Array.from({ length: 8 }, (_, index) => ({
    x: 8 + ((hash >>> (index % 16)) + index * 19) % 84,
    y: 7 + ((hash >>> ((index + 4) % 16)) + index * 13) % 86,
    delay: -((hash + index * 7) % 17),
    size: index % 3 === 0 ? 0.8 : 0.42,
  }));
  const style = {
    "--lumen-progress": `${Math.max(0, Math.min(100, progress))}`,
    "--lumen-opacity": `${0.055 + Math.max(0.2, Math.min(1, signal)) * 0.06}`,
    "--lumen-scale": `${0.85 + Math.max(0.2, Math.min(1, signal)) * 0.22}`,
    "--lumen-scale-active": `${0.94 + Math.max(0.2, Math.min(1, signal)) * 0.25}`,
    "--lumen-origin-x": `${22 + (hash % 57)}%`,
    "--lumen-origin-y": `${18 + ((hash >>> 7) % 48)}%`,
  } as CSSProperties;

  return (
    <div className={`${styles.field} ${enabled ? styles.enabled : ""}`} style={style} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.glowSecondary} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        <path className={styles.orbit} pathLength="100" d="M-8 76 C17 31 39 91 60 42 S93 19 108 52" />
        <path className={styles.progressOrbit} pathLength="100" d="M-8 76 C17 31 39 91 60 42 S93 19 108 52" />
        {motes.map((mote, index) => (
          <circle
            key={index}
            className={styles.mote}
            cx={mote.x}
            cy={mote.y}
            r={mote.size}
            style={{ animationDelay: `${mote.delay}s` }}
          />
        ))}
      </svg>
      <div className={styles.grain} />
    </div>
  );
}
