import type { CSSProperties, ReactNode } from "react";
import {
  COURSE_ACCENT_CONTRAST,
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  parseCourseAppearance,
  type CourseAppearance,
} from "@/lib/course-appearance";

const surfaces = {
  parchment: { page: "#F4F0E6", canvas: "#FBF8F1", line: "#DED7C9" },
  ivory: { page: "#FBF8F1", canvas: "#FFFFFF", line: "#E1DBD0" },
  mist: { page: "#E8EFED", canvas: "#F9FBF9", line: "#CAD8D3" },
  herbarium: { page: "#E7ECE2", canvas: "#FAF8EF", line: "#CAD2C2" },
  rose: { page: "#F4E9E6", canvas: "#FFF9F5", line: "#DECBC6" },
} as const;

export function courseAppearanceVariables(value?: CourseAppearance | null): CSSProperties {
  const appearance = parseCourseAppearance(value ?? DEFAULT_COURSE_APPEARANCE);
  const surface = surfaces[appearance.surface];
  return {
    "--course-page": surface.page,
    "--course-canvas": surface.canvas,
    "--course-line": surface.line,
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
      data-course-atmosphere={resolved.atmosphere}
      data-course-reading-width={resolved.readingWidth}
      style={courseAppearanceVariables(resolved)}
    >
      {children}
    </div>
  );
}
