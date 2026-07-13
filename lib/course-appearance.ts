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
] as const;

export const COURSE_TYPOGRAPHIES = ["editorial", "literary", "modern", "clear"] as const;
export const COURSE_SURFACES = ["parchment", "ivory", "mist", "herbarium", "rose"] as const;
export const COURSE_ACCENTS = ["lime", "amber", "teal", "rose", "dusk", "moss"] as const;
export const COURSE_ATMOSPHERES = ["full", "quiet"] as const;
export const COURSE_READING_WIDTHS = ["focused", "balanced", "wide"] as const;
export const COURSE_TEMPLATE_IDS = [
  "storybook",
  "field-notes",
  "cinematic",
  "modern-atlas",
  "quiet-library",
  "clear-focus",
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
];

export const COURSE_ACCENT_HEX: Record<CourseAccent, string> = {
  lime: "#D8FF63",
  amber: "#F0B35A",
  teal: "#248C8D",
  rose: "#C98C83",
  dusk: "#526A8C",
  moss: "#6E8B72",
};

export const COURSE_ACCENT_CONTRAST: Record<CourseAccent, "#183029" | "#FFFFFF"> = {
  lime: "#183029",
  amber: "#183029",
  teal: "#FFFFFF",
  rose: "#183029",
  dusk: "#FFFFFF",
  moss: "#FFFFFF",
};

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
