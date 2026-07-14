import type { CSSProperties } from "react";
import {
  COURSE_ACCENT_CONTRAST,
  COURSE_ACCENT_HEX,
  COURSE_APPEARANCE_TEMPLATES,
  DEFAULT_COURSE_APPEARANCE,
  parseCourseAppearance,
  type CourseAppearance,
  type CourseSurface,
  type CourseTemplateId,
  type CourseWorldTheme,
} from "./course-appearance";

export type CourseCardTreatment = "paper" | "glass" | "vault" | "soft";
export type CourseBorderTreatment = "hairline" | "cut" | "metallic" | "ornament" | "luminous";
export type CoursePattern = "none" | "grid" | "ledger" | "contour" | "geometry" | "circuit";
export type CourseIconTreatment = "outlined" | "engraved" | "wayfinding" | "jewel" | "signal";
export type CourseLockTreatment = "simple" | "classified" | "vault" | "milestone" | "seal" | "encrypted";
export type CourseButtonTreatment = "solid" | "quiet" | "glow";

export type CourseThemeDefinition = {
  id: Exclude<CourseTemplateId, "custom">;
  name: string;
  tagline: string;
  appearance: CourseAppearance;
  colors: {
    primary: string;
    secondary: string;
    ambient: string;
    onPrimary: string;
  };
  cardStyle: CourseCardTreatment;
  borderStyle: CourseBorderTreatment;
  decorativePattern: CoursePattern;
  iconStyle: CourseIconTreatment;
  lockStyle: CourseLockTreatment;
  buttonStyle: CourseButtonTreatment;
};

type SurfaceTokens = {
  page: string;
  canvas: string;
  raised: string;
  line: string;
  lineDeep: string;
  ink: string;
  inkSoft: string;
};

export const COURSE_SURFACE_TOKENS: Record<CourseSurface, SurfaceTokens> = {
  parchment: { page: "#F4F0E6", canvas: "#FBF8F1", raised: "#FFFDF8", line: "#DED7C9", lineDeep: "#C8BEAD", ink: "#183029", inkSoft: "#6E776F" },
  ivory: { page: "#F7F4ED", canvas: "#FFFDF8", raised: "#FFFFFF", line: "#E1DBD0", lineDeep: "#CCC4B7", ink: "#21332C", inkSoft: "#6E776F" },
  mist: { page: "#E8EFED", canvas: "#F9FBF9", raised: "#FFFFFF", line: "#CAD8D3", lineDeep: "#AABDB7", ink: "#183029", inkSoft: "#66756F" },
  herbarium: { page: "#E7ECE2", canvas: "#FAF8EF", raised: "#FFFDF7", line: "#CAD2C2", lineDeep: "#ADB9A6", ink: "#183029", inkSoft: "#69736B" },
  rose: { page: "#F4E9E6", canvas: "#FFF9F5", raised: "#FFFFFF", line: "#DECBC6", lineDeep: "#C9ADA6", ink: "#322426", inkSoft: "#7C696B" },
  noir: { page: "#09090C", canvas: "#141216", raised: "#1B171C", line: "#39272E", lineDeep: "#5A3541", ink: "#F3EDEF", inkSoft: "#B6A7AC" },
  evergreen: { page: "#061812", canvas: "#0D241B", raised: "#123027", line: "#29483B", lineDeep: "#4B6B59", ink: "#F5F0DF", inkSoft: "#B8B29F" },
  sand: { page: "#E9E2D4", canvas: "#F7F3E9", raised: "#FFFCF5", line: "#D5CCBC", lineDeep: "#B8A993", ink: "#18372F", inkSoft: "#65746C" },
  pearl: { page: "#F0F1EA", canvas: "#FCFBF4", raised: "#FFFFFF", line: "#D7D9CC", lineDeep: "#B8BDAE", ink: "#15372F", inkSoft: "#64746D" },
  frost: { page: "#E8F0F3", canvas: "#F7FBFC", raised: "#FFFFFF", line: "#C8D9DF", lineDeep: "#9FBBC5", ink: "#102F3C", inkSoft: "#607985" },
};

const requestedPresetIds = [
  "shadow-files",
  "wealth-vault",
  "growth-strategy",
  "islamic-studies",
  "science-tech",
  "classic-neutral",
] as const;

function presetAppearance(id: (typeof requestedPresetIds)[number]) {
  return COURSE_APPEARANCE_TEMPLATES.find((preset) => preset.id === id)!.appearance;
}

export const COURSE_THEME_PRESETS: ReadonlyArray<CourseThemeDefinition> = [
  {
    id: "shadow-files",
    name: "Dark Psychology",
    tagline: "A classified room for pattern recognition.",
    appearance: presetAppearance("shadow-files"),
    colors: { primary: "#0A090C", secondary: "#4A2330", ambient: "#E0526F", onPrimary: "#F7F1F3" },
    cardStyle: "glass", borderStyle: "cut", decorativePattern: "grid", iconStyle: "outlined", lockStyle: "classified", buttonStyle: "glow",
  },
  {
    id: "wealth-vault",
    name: "Wealth / Money",
    tagline: "A private ledger of compounding decisions.",
    appearance: presetAppearance("wealth-vault"),
    colors: { primary: "#061E16", secondary: "#214C38", ambient: "#D9B85B", onPrimary: "#F8F2DC" },
    cardStyle: "vault", borderStyle: "metallic", decorativePattern: "ledger", iconStyle: "engraved", lockStyle: "vault", buttonStyle: "solid",
  },
  {
    id: "growth-strategy",
    name: "Growth / Strategy",
    tagline: "A calm atlas for ambitious moves.",
    appearance: presetAppearance("growth-strategy"),
    colors: { primary: "#153C33", secondary: "#86785F", ambient: "#2E8B68", onPrimary: "#F8F4E9" },
    cardStyle: "paper", borderStyle: "hairline", decorativePattern: "contour", iconStyle: "wayfinding", lockStyle: "milestone", buttonStyle: "solid",
  },
  {
    id: "islamic-studies",
    name: "Islamic Studies",
    tagline: "A respectful, contemplative reading sanctuary.",
    appearance: presetAppearance("islamic-studies"),
    colors: { primary: "#173D35", secondary: "#AA9463", ambient: "#2B8C7F", onPrimary: "#FBF8ED" },
    cardStyle: "soft", borderStyle: "ornament", decorativePattern: "geometry", iconStyle: "jewel", lockStyle: "seal", buttonStyle: "quiet",
  },
  {
    id: "science-tech",
    name: "Science / Tech",
    tagline: "A luminous lab for precise discovery.",
    appearance: presetAppearance("science-tech"),
    colors: { primary: "#0D2B38", secondary: "#46798C", ambient: "#37B6D4", onPrimary: "#F1FAFC" },
    cardStyle: "glass", borderStyle: "luminous", decorativePattern: "circuit", iconStyle: "signal", lockStyle: "encrypted", buttonStyle: "glow",
  },
  {
    id: "classic-neutral",
    name: "Classic Neutral",
    tagline: "Timeless editorial structure with a quiet pulse.",
    appearance: presetAppearance("classic-neutral"),
    colors: { primary: "#24362F", secondary: "#69786F", ambient: "#526A8C", onPrimary: "#FFFFFF" },
    cardStyle: "paper", borderStyle: "hairline", decorativePattern: "none", iconStyle: "outlined", lockStyle: "simple", buttonStyle: "solid",
  },
];

const fallbackDefinition = COURSE_THEME_PRESETS[5];

const legacyWorldTreatments: Partial<Record<CourseWorldTheme, Partial<CourseThemeDefinition>>> = {
  archive: { decorativePattern: "ledger", iconStyle: "engraved", lockStyle: "seal" },
  manuscript: { decorativePattern: "geometry", iconStyle: "engraved", lockStyle: "seal" },
  cosmic: { decorativePattern: "grid", iconStyle: "signal", lockStyle: "encrypted", buttonStyle: "glow" },
  laboratory: { decorativePattern: "circuit", iconStyle: "signal", lockStyle: "encrypted" },
  "knowledge-city": { decorativePattern: "grid", iconStyle: "wayfinding", lockStyle: "milestone" },
};

export function resolveCourseThemeDefinition(value?: CourseAppearance | null): CourseThemeDefinition {
  const appearance = parseCourseAppearance(value ?? DEFAULT_COURSE_APPEARANCE);
  const selected = COURSE_THEME_PRESETS.find((preset) => preset.id === appearance.template);
  if (selected) return selected;
  const worldMatch = COURSE_THEME_PRESETS.find((preset) => preset.appearance.worldTheme === appearance.worldTheme);
  if (worldMatch) return { ...worldMatch, appearance };
  return {
    ...fallbackDefinition,
    ...legacyWorldTreatments[appearance.worldTheme],
    id: appearance.template === "custom" ? "classic-neutral" : appearance.template,
    name: COURSE_APPEARANCE_TEMPLATES.find((preset) => preset.id === appearance.template)?.name ?? "Custom world",
    appearance,
  };
}

const cardRadius: Record<CourseCardTreatment, string> = {
  paper: "1rem",
  glass: "0.85rem",
  vault: "0.7rem",
  soft: "1.25rem",
};

const cardShadow: Record<CourseCardTreatment, string> = {
  paper: "0 16px 45px color-mix(in srgb, var(--course-primary) 10%, transparent)",
  glass: "0 24px 70px rgb(0 0 0 / 0.24)",
  vault: "0 22px 60px rgb(0 0 0 / 0.28), inset 0 1px rgb(255 255 255 / 0.04)",
  soft: "0 18px 50px color-mix(in srgb, var(--course-primary) 8%, transparent)",
};

export function courseThemeVariables(value?: CourseAppearance | null): CSSProperties {
  const appearance = parseCourseAppearance(value ?? DEFAULT_COURSE_APPEARANCE);
  const theme = resolveCourseThemeDefinition(appearance);
  const surface = COURSE_SURFACE_TOKENS[appearance.surface];
  return {
    "--course-page": surface.page,
    "--course-canvas": surface.canvas,
    "--course-raised": surface.raised,
    "--course-line": surface.line,
    "--course-line-deep": surface.lineDeep,
    "--course-ink": surface.ink,
    "--course-ink-soft": surface.inkSoft,
    "--course-primary": theme.colors.primary,
    "--course-secondary": theme.colors.secondary,
    "--course-ambient": theme.colors.ambient,
    "--course-on-primary": theme.colors.onPrimary,
    "--course-accent": COURSE_ACCENT_HEX[appearance.accent],
    "--course-accent-contrast": COURSE_ACCENT_CONTRAST[appearance.accent],
    "--course-card-radius": cardRadius[theme.cardStyle],
    "--course-card-shadow": cardShadow[theme.cardStyle],
  } as CSSProperties;
}
