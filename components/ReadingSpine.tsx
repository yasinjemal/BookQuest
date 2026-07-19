import type { CSSProperties } from "react";
import type { ReadingUnitOutline } from "@/lib/reading-types";
import styles from "./ReadingSpine.module.css";

export default function ReadingSpine({
  outline,
  currentIndex,
  unitProgress,
  onSelect,
  variant = "rail",
}: {
  outline: ReadingUnitOutline[];
  currentIndex: number;
  unitProgress: number;
  onSelect: (index: number) => void;
  variant?: "rail" | "atlas";
}) {
  const largest = Math.max(1, ...outline.map((item) => item.wordCount));

  return (
    <nav className={`${styles.spine} ${styles[variant]}`} aria-label="Book path">
      <header>
        <span>Book path</span>
        <strong>{String(currentIndex + 1).padStart(2, "0")} / {String(outline.length).padStart(2, "0")}</strong>
      </header>
      <ol>
        {outline.map((item) => {
          const state = item.index < currentIndex ? "past" : item.index === currentIndex ? "current" : "upcoming";
          const fill = state === "past" ? 100 : state === "current" ? unitProgress : 0;
          const depth = 2.75 + Math.sqrt(item.wordCount / largest) * 1.5;
          return (
            <li key={item.index} style={{ "--spine-depth": `${depth}rem`, "--spine-fill": `${fill}%` } as CSSProperties} data-state={state}>
              <button type="button" onClick={() => onSelect(item.index)} aria-current={state === "current" ? "page" : undefined}>
                <span className={styles.node} aria-hidden="true"><i /></span>
                <span className={styles.copy}>
                  <small>{String(item.index + 1).padStart(2, "0")} · {item.wordCount.toLocaleString()} words</small>
                  <strong>{item.title}</strong>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
