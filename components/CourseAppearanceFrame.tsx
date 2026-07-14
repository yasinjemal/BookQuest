import type { CSSProperties, ReactNode } from "react";
import {
  COURSE_ACCENT_CONTRAST,
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  parseCourseAppearance,
  type CourseAppearance,
} from "@/lib/course-appearance";

const surfaces = {
  parchment: { page: "#F4F0E6", canvas: "#FBF8F1", line: "#DED7C9", lineDeep: "#C8BEAD", ink: "#183029", inkSoft: "#6E776F" },
  ivory: { page: "#FBF8F1", canvas: "#FFFFFF", line: "#E1DBD0", lineDeep: "#CCC4B7", ink: "#183029", inkSoft: "#6E776F" },
  mist: { page: "#E8EFED", canvas: "#F9FBF9", line: "#CAD8D3", lineDeep: "#AABDB7", ink: "#183029", inkSoft: "#66756F" },
  herbarium: { page: "#E7ECE2", canvas: "#FAF8EF", line: "#CAD2C2", lineDeep: "#ADB9A6", ink: "#183029", inkSoft: "#69736B" },
  rose: { page: "#F4E9E6", canvas: "#FFF9F5", line: "#DECBC6", lineDeep: "#C9ADA6", ink: "#322426", inkSoft: "#7C696B" },
  noir: { page: "#09090C", canvas: "#141216", line: "#39272E", lineDeep: "#5A3541", ink: "#F3EDEF", inkSoft: "#B6A7AC" },
} as const;

export function courseAppearanceVariables(value?: CourseAppearance | null): CSSProperties {
  const appearance = parseCourseAppearance(value ?? DEFAULT_COURSE_APPEARANCE);
  const surface = surfaces[appearance.surface];
  return {
    "--course-page": surface.page,
    "--course-canvas": surface.canvas,
    "--course-line": surface.line,
    "--course-line-deep": surface.lineDeep,
    "--course-ink": surface.ink,
    "--course-ink-soft": surface.inkSoft,
    "--course-accent": COURSE_ACCENT_HEX[appearance.accent],
    "--course-accent-contrast": COURSE_ACCENT_CONTRAST[appearance.accent],
  } as CSSProperties;
}

export default function CourseAppearanceFrame({
  appearance,
  children,
  className = "",
}: {
  appearance?: CourseAppearance | null;
  children: ReactNode;
  className?: string;
}) {
  const resolved = parseCourseAppearance(appearance ?? DEFAULT_COURSE_APPEARANCE);
  return (
    <div
      className={`course-appearance ${className}`}
      data-course-template={resolved.template}
      data-course-typography={resolved.typography}
      data-course-surface={resolved.surface}
      data-course-world={resolved.worldTheme}
      data-course-atmosphere={resolved.atmosphere}
      data-course-reading-width={resolved.readingWidth}
      style={courseAppearanceVariables(resolved)}
    >
      {children}
    </div>
  );
}
