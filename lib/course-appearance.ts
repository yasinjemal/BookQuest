import { z } from "zod/v4";

export const COURSE_WORLD_THEMES = [
  "forest",
  "mountain",
  "ocean",
  "desert",
  "city-night",
  "archive",
  "cosmic",
  "workshop",
  "laboratory",
  "garden",
  "village",
  "sunrise-plains",
  "winter",
  "manuscript",
  "knowledge-city",
  "shadow",
  "wealth",
  "strategy",
  "sanctuary",
  "science",
  "neutral",
] as const;

export const COURSE_TYPOGRAPHIES = ["editorial", "literary", "modern", "clear"] as const;
export const COURSE_SURFACES = ["parchment", "ivory", "mist", "herbarium", "rose", "noir", "evergreen", "sand", "pearl", "frost"] as const;
export const COURSE_ACCENTS = ["lime", "amber", "teal", "rose", "dusk", "moss", "crimson", "gold", "emerald", "jade", "cyan"] as const;
export const COURSE_ATMOSPHERES = ["full", "quiet"] as const;
export const COURSE_READING_WIDTHS = ["focused", "balanced", "wide"] as const;
export const COURSE_TEMPLATE_IDS = [
  "storybook",
  "field-notes",
  "cinematic",
  "modern-atlas",
  "quiet-library",
  "clear-focus",
  "shadow-files",
  "wealth-vault",
  "growth-strategy",
  "islamic-studies",
  "science-tech",
  "classic-neutral",
  "custom",
] as const;

export type CourseWorldTheme = (typeof COURSE_WORLD_THEMES)[number];
export type CourseTypography = (typeof COURSE_TYPOGRAPHIES)[number];
export type CourseSurface = (typeof COURSE_SURFACES)[number];
export type CourseAccent = (typeof COURSE_ACCENTS)[number];
export type CourseAtmosphere = (typeof COURSE_ATMOSPHERES)[number];
export type CourseReadingWidth = (typeof COURSE_READING_WIDTHS)[number];
export type CourseTemplateId = (typeof COURSE_TEMPLATE_IDS)[number];

export const CourseAppearanceSchema = z.object({
  template: z.enum(COURSE_TEMPLATE_IDS),
  worldTheme: z.enum(COURSE_WORLD_THEMES),
  typography: z.enum(COURSE_TYPOGRAPHIES),
  surface: z.enum(COURSE_SURFACES),
  accent: z.enum(COURSE_ACCENTS),
  atmosphere: z.enum(COURSE_ATMOSPHERES),
  readingWidth: z.enum(COURSE_READING_WIDTHS),
});

export type CourseAppearance = z.infer<typeof CourseAppearanceSchema>;

export const DEFAULT_COURSE_APPEARANCE: CourseAppearance = {
  template: "storybook",
  worldTheme: "forest",
  typography: "editorial",
  surface: "parchment",
  accent: "lime",
  atmosphere: "full",
  readingWidth: "balanced",
};

export const COURSE_APPEARANCE_TEMPLATES: ReadonlyArray<{
  id: Exclude<CourseTemplateId, "custom">;
  name: string;
  description: string;
  appearance: CourseAppearance;
}> = [
  {
    id: "storybook",
    name: "Living Storybook",
    description: "Warm parchment, expressive titles, and a richly illustrated forest world.",
    appearance: DEFAULT_COURSE_APPEARANCE,
  },
  {
    id: "field-notes",
    name: "Field Notes",
    description: "A grounded landscape with literary type and a focused, observant reading rhythm.",
    appearance: { template: "field-notes", worldTheme: "mountain", typography: "literary", surface: "herbarium", accent: "amber", atmosphere: "quiet", readingWidth: "focused" },
  },
  {
    id: "cinematic",
    name: "After Dark",
    description: "A dramatic city-at-night entrance balanced by a calm mist reading surface.",
    appearance: { template: "cinematic", worldTheme: "city-night", typography: "editorial", surface: "mist", accent: "rose", atmosphere: "full", readingWidth: "wide" },
  },
  {
    id: "modern-atlas",
    name: "Modern Atlas",
    description: "Structured, contemporary, and precise for professional or technical subjects.",
    appearance: { template: "modern-atlas", worldTheme: "knowledge-city", typography: "modern", surface: "ivory", accent: "teal", atmosphere: "quiet", readingWidth: "balanced" },
  },
  {
    id: "quiet-library",
    name: "Quiet Library",
    description: "An intimate archive with bookish typography and a narrow, restful measure.",
    appearance: { template: "quiet-library", worldTheme: "archive", typography: "literary", surface: "parchment", accent: "amber", atmosphere: "quiet", readingWidth: "focused" },
  },
  {
    id: "clear-focus",
    name: "Clear Focus",
    description: "Low-decoration, highly legible typography for dense or accessibility-led learning.",
    appearance: { template: "clear-focus", worldTheme: "laboratory", typography: "clear", surface: "ivory", accent: "dusk", atmosphere: "quiet", readingWidth: "balanced" },
  },
  {
    id: "shadow-files",
    name: "Dark Psychology",
    description: "A cinematic charcoal case room with oxblood detail, sealed lessons, and a focused reading rhythm.",
    appearance: { template: "shadow-files", worldTheme: "shadow", typography: "modern", surface: "noir", accent: "crimson", atmosphere: "full", readingWidth: "focused" },
  },
  {
    id: "wealth-vault",
    name: "Wealth / Money",
    description: "Deep evergreen, brushed gold, ledger lines, and vault-like milestones.",
    appearance: { template: "wealth-vault", worldTheme: "wealth", typography: "editorial", surface: "evergreen", accent: "gold", atmosphere: "full", readingWidth: "focused" },
  },
  {
    id: "growth-strategy",
    name: "Growth / Strategy",
    description: "Emerald direction, warm sand, contour paths, and ambitious clarity.",
    appearance: { template: "growth-strategy", worldTheme: "strategy", typography: "modern", surface: "sand", accent: "emerald", atmosphere: "full", readingWidth: "balanced" },
  },
  {
    id: "islamic-studies",
    name: "Islamic Studies",
    description: "A calm pearl reading room with jade detail and restrained geometric ornament.",
    appearance: { template: "islamic-studies", worldTheme: "sanctuary", typography: "literary", surface: "pearl", accent: "jade", atmosphere: "quiet", readingWidth: "focused" },
  },
  {
    id: "science-tech",
    name: "Science / Tech",
    description: "Cool luminous surfaces, cyan signals, precise grids, and encrypted discoveries.",
    appearance: { template: "science-tech", worldTheme: "science", typography: "modern", surface: "frost", accent: "cyan", atmosphere: "full", readingWidth: "balanced" },
  },
  {
    id: "classic-neutral",
    name: "Classic Neutral",
    description: "A timeless ivory workspace with quiet structure and maximum readability.",
    appearance: { template: "classic-neutral", worldTheme: "neutral", typography: "editorial", surface: "ivory", accent: "dusk", atmosphere: "quiet", readingWidth: "balanced" },
  },
];

export const COURSE_ACCENT_HEX: Record<CourseAccent, string> = {
  lime: "#D8FF63",
  amber: "#F0B35A",
  teal: "#248C8D",
  rose: "#C98C83",
  dusk: "#526A8C",
  moss: "#6E8B72",
  crimson: "#E0526F",
  gold: "#D9B85B",
  emerald: "#2E8B68",
  jade: "#2B8C7F",
  cyan: "#37B6D4",
};

export const COURSE_ACCENT_CONTRAST: Record<CourseAccent, string> = {
  lime: "#183029",
  amber: "#183029",
  teal: "#FFFFFF",
  rose: "#183029",
  dusk: "#FFFFFF",
  moss: "#FFFFFF",
  crimson: "#160B0F",
  gold: "#15271F",
  emerald: "#FFFFFF",
  jade: "#FFFFFF",
  cyan: "#082631",
};

export type CourseWorldLockCopy = {
  eyebrow: string;
  hint: string;
};

const DEFAULT_LOCK_COPY: CourseWorldLockCopy = {
  eyebrow: "Further along the path",
  hint: "Complete the previous lesson to reveal this stop.",
};

const WORLD_LOCK_COPY: Partial<Record<CourseWorldTheme, CourseWorldLockCopy>> = {
  shadow: {
    eyebrow: "Restricted lesson",
    hint: "Continue the investigation to earn clearance.",
  },
  archive: {
    eyebrow: "Archive sealed",
    hint: "Complete the previous record to break the seal.",
  },
  manuscript: {
    eyebrow: "Sealed folio",
    hint: "Follow the text to reveal the next page.",
  },
  cosmic: {
    eyebrow: "Signal encrypted",
    hint: "Reach this coordinate to decode the transmission.",
  },
  workshop: {
    eyebrow: "Toolbox locked",
    hint: "Finish the current build to open this station.",
  },
  wealth: {
    eyebrow: "Vault sealed",
    hint: "Reach the next milestone to open this reserve.",
  },
  strategy: {
    eyebrow: "Next horizon",
    hint: "Complete this move to reveal the next advantage.",
  },
  sanctuary: {
    eyebrow: "Study circle ahead",
    hint: "Complete the present lesson to open the next reading.",
  },
  science: {
    eyebrow: "Module encrypted",
    hint: "Finish this experiment to decode the next signal.",
  },
  neutral: {
    eyebrow: "Next chapter",
    hint: "Complete the current lesson to continue.",
  },
};

export function courseWorldLockCopy(theme: CourseWorldTheme): CourseWorldLockCopy {
  return WORLD_LOCK_COPY[theme] ?? DEFAULT_LOCK_COPY;
}

export function parseCourseAppearance(value: unknown): CourseAppearance {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      return DEFAULT_COURSE_APPEARANCE;
    }
  }
  const parsed = CourseAppearanceSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_COURSE_APPEARANCE;
}

export function serializeCourseAppearance(value: unknown): string {
  return JSON.stringify(CourseAppearanceSchema.parse(value));
}
