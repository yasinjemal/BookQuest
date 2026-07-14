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
] as const;

export const COURSE_TYPOGRAPHIES = ["editorial", "literary", "modern", "clear"] as const;
export const COURSE_SURFACES = ["parchment", "ivory", "mist", "herbarium", "rose", "noir"] as const;
export const COURSE_ACCENTS = ["lime", "amber", "teal", "rose", "dusk", "moss", "crimson"] as const;
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
    name: "Shadow Files",
    description: "A cinematic charcoal case room with oxblood detail, sealed lessons, and a focused reading rhythm.",
    appearance: { template: "shadow-files", worldTheme: "shadow", typography: "modern", surface: "noir", accent: "crimson", atmosphere: "full", readingWidth: "focused" },
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
};

export const COURSE_ACCENT_CONTRAST: Record<CourseAccent, "#183029" | "#FFFFFF" | "#160B0F"> = {
  lime: "#183029",
  amber: "#183029",
  teal: "#FFFFFF",
  rose: "#183029",
  dusk: "#FFFFFF",
  moss: "#FFFFFF",
  crimson: "#160B0F",
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
