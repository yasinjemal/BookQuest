import { describe, expect, it } from "vitest";
import {
  COURSE_APPEARANCE_TEMPLATES,
  DEFAULT_COURSE_APPEARANCE,
  parseCourseAppearance,
  serializeCourseAppearance,
} from "../lib/course-appearance";
import { COURSE_THEME_PRESETS, courseThemeVariables, resolveCourseThemeDefinition } from "../lib/course-themes";

describe("course appearance", () => {
  it("keeps every shipped template valid and explicit", () => {
    expect(COURSE_APPEARANCE_TEMPLATES).toHaveLength(12);
    for (const template of COURSE_APPEARANCE_TEMPLATES) {
      expect(parseCourseAppearance(template.appearance)).toEqual(template.appearance);
      expect(template.appearance.template).toBe(template.id);
    }
  });

  it("ships six distinct premium subject presets with semantic treatments", () => {
    expect(COURSE_THEME_PRESETS.map((theme) => theme.name)).toEqual([
      "Dark Psychology",
      "Wealth / Money",
      "Growth / Strategy",
      "Islamic Studies",
      "Science / Tech",
      "Classic Neutral",
    ]);
    for (const theme of COURSE_THEME_PRESETS) {
      expect(resolveCourseThemeDefinition(theme.appearance).lockStyle).toBe(theme.lockStyle);
      expect(courseThemeVariables(theme.appearance)).toMatchObject({
        "--course-primary": theme.colors.primary,
        "--course-ambient": theme.colors.ambient,
      });
    }
  });

  it("ships the shadow world as a complete bounded preset", () => {
    const shadow = COURSE_APPEARANCE_TEMPLATES.find((item) => item.id === "shadow-files")!;
    expect(shadow.appearance).toEqual({
      template: "shadow-files",
      worldTheme: "shadow",
      typography: "modern",
      surface: "noir",
      accent: "crimson",
      atmosphere: "full",
      readingWidth: "focused",
    });
    expect(parseCourseAppearance(shadow.appearance)).toEqual(shadow.appearance);
  });

  it("falls back safely for missing, malformed, or untrusted settings", () => {
    expect(parseCourseAppearance(undefined)).toEqual(DEFAULT_COURSE_APPEARANCE);
    expect(parseCourseAppearance("not-json")).toEqual(DEFAULT_COURSE_APPEARANCE);
    expect(parseCourseAppearance({ ...DEFAULT_COURSE_APPEARANCE, typography: "remote-font" }))
      .toEqual(DEFAULT_COURSE_APPEARANCE);
  });

  it("serializes only validated bounded choices", () => {
    const atlas = COURSE_APPEARANCE_TEMPLATES.find((item) => item.id === "modern-atlas")!.appearance;
    expect(parseCourseAppearance(serializeCourseAppearance(atlas))).toEqual(atlas);
    expect(() => serializeCourseAppearance({ ...atlas, surface: "url(https://example.test)" }))
      .toThrow();
  });
});
