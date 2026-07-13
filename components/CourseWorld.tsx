import type { CSSProperties, ReactNode } from "react";
import styles from "./CourseWorld.module.css";
import { COURSE_WORLD_THEMES, type CourseWorldTheme } from "@/lib/course-appearance";

export const WORLD_THEMES = COURSE_WORLD_THEMES;
export type WorldTheme = CourseWorldTheme;
export type WorldMood = "calm" | "bright" | "dusk";

type WorldPalette = {
  top: string;
  bottom: string;
  far: string;
  mid: string;
  near: string;
  accent: string;
  light: string;
};

const palettes: Record<WorldTheme, WorldPalette> = {
  forest: { top: "#1d5545", bottom: "#0a211b", far: "#4f7862", mid: "#214c3d", near: "#0a211b", accent: "#d8ff63", light: "#f3d59b" },
  mountain: { top: "#526a8c", bottom: "#1d3340", far: "#8b9cad", mid: "#445b62", near: "#183029", accent: "#f0b35a", light: "#f8dfb2" },
  ocean: { top: "#397e8c", bottom: "#0b3440", far: "#80a9a7", mid: "#216071", near: "#092b34", accent: "#d8ff63", light: "#f4e7bf" },
  desert: { top: "#b8755f", bottom: "#6c3f35", far: "#d5a271", mid: "#a96049", near: "#563228", accent: "#f0b35a", light: "#f9e3aa" },
  "city-night": { top: "#26344e", bottom: "#0b1721", far: "#526a8c", mid: "#263b4e", near: "#09151c", accent: "#d8ff63", light: "#f0b35a" },
  archive: { top: "#775f48", bottom: "#2b261f", far: "#ae9271", mid: "#66513b", near: "#251f19", accent: "#f0b35a", light: "#f7e7bd" },
  cosmic: { top: "#302d58", bottom: "#0b1325", far: "#5c568d", mid: "#2e365d", near: "#090f1d", accent: "#d8ff63", light: "#d8d9ff" },
  workshop: { top: "#596b63", bottom: "#202f2a", far: "#a37a55", mid: "#665346", near: "#18251f", accent: "#f0b35a", light: "#ffe6b4" },
  laboratory: { top: "#416d75", bottom: "#142c36", far: "#88aaac", mid: "#315a62", near: "#10242c", accent: "#d8ff63", light: "#d8f5ed" },
  garden: { top: "#558273", bottom: "#173b2f", far: "#94ac83", mid: "#48755b", near: "#163628", accent: "#f0b35a", light: "#fbefbd" },
  village: { top: "#71899b", bottom: "#344f4b", far: "#a8a58c", mid: "#60745e", near: "#243d34", accent: "#f0b35a", light: "#f7e3b3" },
  "sunrise-plains": { top: "#cb8c7c", bottom: "#596d5c", far: "#dfb07f", mid: "#8b8160", near: "#354c3c", accent: "#d8ff63", light: "#fff0b8" },
  winter: { top: "#8097ad", bottom: "#394f62", far: "#d9e1e2", mid: "#9aadb5", near: "#344957", accent: "#d8ff63", light: "#f8f3df" },
  manuscript: { top: "#a27d52", bottom: "#4e3828", far: "#c6a776", mid: "#826343", near: "#38281e", accent: "#f0b35a", light: "#f8e3b5" },
  "knowledge-city": { top: "#286b70", bottom: "#142a38", far: "#65959a", mid: "#285867", near: "#10232d", accent: "#d8ff63", light: "#d9faf0" },
};

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveWorldTheme(seed: string | number, preferred?: string): WorldTheme {
  if (preferred && (WORLD_THEMES as readonly string[]).includes(preferred)) return preferred as WorldTheme;
  return WORLD_THEMES[hashSeed(String(seed)) % WORLD_THEMES.length];
}

function landscape(theme: WorldTheme, variant: number): ReactNode {
  if (theme === "ocean") return <>
    <path className={styles.far} d="M0 58 C18 50 31 66 50 57 C68 48 84 61 100 54 V100 H0Z" />
    <path className={styles.middle} d="M0 69 C17 62 31 78 49 68 C68 58 81 75 100 65 V100 H0Z" />
    <path className={styles.near} d="M0 83 C19 75 35 89 54 79 C71 71 88 83 100 76 V100 H0Z" />
    <path className={styles.detail} d="M13 58c7-4 12-4 19 0M62 62c8-5 14-5 22 0" />
  </>;

  if (theme === "cosmic") return <>
    <path className={styles.far} d="M-8 82 Q50 32 108 82 V100 H-8Z" />
    <path className={styles.middle} d="M-5 92 Q46 56 105 88 V100 H-5Z" />
    <ellipse className={styles.halo} cx={72 - variant % 18} cy="29" rx="13" ry="5" transform={`rotate(${-14 + variant % 8} ${72 - variant % 18} 29)`} />
    <circle className={styles.light} cx={72 - variant % 18} cy="29" r="6" />
  </>;

  if (["city-night", "archive", "workshop", "laboratory", "knowledge-city"].includes(theme)) {
    return <>
      <path className={styles.far} d="M0 64h9V49h9v10h8V38h11v20h7V45h13v15h8V33h12v27h8V44h16v56H0Z" />
      <path className={styles.middle} d="M0 74h14V58h10v10h13V53h15v18h13V48h11v22h12V57h12v43H0Z" />
      <path className={styles.near} d="M0 85h20V69h18v12h16V64h20v18h26v18H0Z" />
      <path className={styles.detail} d="M29 44v9m4-9v9m36-14v12m4-12v12M57 59v8m4-8v8" />
    </>;
  }

  if (theme === "forest" || theme === "garden") return <>
    <path className={styles.far} d="M0 67 12 44l7 14 10-27 11 27 8-20 12 25 9-32 13 29 8-18 10 25v33H0Z" />
    <path className={styles.middle} d="M0 78 10 55l8 13 9-25 12 31 8-21 11 23 8-28 12 27 8-18 14 23v20H0Z" />
    <path className={styles.near} d="M0 88c18-8 31-1 45-5 17-5 31-12 55-2v19H0Z" />
  </>;

  if (theme === "village") return <>
    <path className={styles.far} d="M0 66 Q22 44 42 62 T78 58 T108 64 V100 H0Z" />
    <path className={styles.middle} d="M8 79V64l9-8 9 8v15m9 0V58l12-10 12 10v21m8 0V66l10-8 10 8v13" />
    <path className={styles.near} d="M0 83 Q34 75 59 84 T100 81 V100 H0Z" />
    <path className={styles.detail} d="M14 70h6m21-5h11m21 6h8" />
  </>;

  return <>
    <path className={styles.far} d="M0 70 18 45 32 62 49 30 66 61 78 40 100 68V100H0Z" />
    <path className={styles.middle} d={`M0 78 Q${24 + variant % 13} 58 49 75 T100 69 V100 H0Z`} />
    <path className={styles.near} d={`M0 86 Q${18 + variant % 17} 73 47 84 T100 79 V100 H0Z`} />
  </>;
}

export default function CourseWorld({
  theme,
  seed,
  progress = 0,
  title,
  mood = "calm",
  artworkUrl,
  accent,
  className = "",
}: {
  theme?: WorldTheme | string;
  seed: string | number;
  progress?: number;
  title?: string;
  mood?: WorldMood;
  artworkUrl?: string | null;
  accent?: string;
  className?: string;
}) {
  const combinedSeed = `${seed}:${title ?? ""}`;
  const variant = hashSeed(combinedSeed);
  const resolvedTheme = resolveWorldTheme(combinedSeed, theme);
  const palette = palettes[resolvedTheme];
  const safeProgress = Math.min(100, Math.max(0, progress));
  const lightX = 24 + (variant % 57);
  const worldStyle = {
    "--world-sky-top": palette.top,
    "--world-sky-bottom": palette.bottom,
    "--world-far": palette.far,
    "--world-mid": palette.mid,
    "--world-near": palette.near,
    "--world-accent": accent ?? palette.accent,
    "--world-light": palette.light,
    "--world-light-x": `${lightX}%`,
  } as CSSProperties;
  const sparks = Array.from({ length: 6 }, (_, index) => ({
    x: 8 + ((variant >> (index * 2)) + index * 17) % 86,
    y: 9 + ((variant >> (index + 1)) + index * 11) % 42,
    r: index % 3 === 0 ? 0.72 : 0.42,
  }));

  return (
    <div
      className={`${styles.world} ${styles[mood]} ${className}`}
      style={worldStyle}
      data-world-theme={resolvedTheme}
      aria-hidden="true"
    >
      {artworkUrl && <img src={artworkUrl} alt="" loading="lazy" className={styles.artwork} />}
      <svg className={styles.scene} viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        <circle className={styles.light} cx={lightX} cy={22 + variant % 10} r={5 + variant % 4} />
        <circle className={styles.halo} cx={lightX} cy={22 + variant % 10} r={10 + variant % 4} />
        {sparks.map((spark, index) => <circle key={index} data-atmospheric-detail="optional" className={styles.spark} cx={spark.x} cy={spark.y} r={spark.r} />)}
        {landscape(resolvedTheme, variant)}
        <path className={styles.trailBase} pathLength="100" d="M8 92 C25 72 36 89 51 71 S75 58 92 42" />
        <path className={styles.trailProgress} pathLength="100" strokeDasharray="100" strokeDashoffset={100 - safeProgress} d="M8 92 C25 72 36 89 51 71 S75 58 92 42" />
      </svg>
    </div>
  );
}
