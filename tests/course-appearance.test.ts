import { describe, expect, it } from "vitest";
import {
  COURSE_APPEARANCE_TEMPLATES,
  DEFAULT_COURSE_APPEARANCE,
  parseCourseAppearance,
  serializeCourseAppearance,
} from "../lib/course-appearance";

describe("course appearance", () => {
  it("keeps every shipped template valid and explicit", () => {
    expect(COURSE_APPEARANCE_TEMPLATES).toHaveLength(6);
    for (const template of COURSE_APPEARANCE_TEMPLATES) {
      expect(parseCourseAppearance(template.appearance)).toEqual(template.appearance);
      expect(template.appearance.template).toBe(template.id);
    }
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
