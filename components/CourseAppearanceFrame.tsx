import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_COURSE_APPEARANCE, parseCourseAppearance, type CourseAppearance } from "@/lib/course-appearance";
import { courseThemeVariables, resolveCourseThemeDefinition } from "@/lib/course-themes";

export function courseAppearanceVariables(value?: CourseAppearance | null): CSSProperties {
  return courseThemeVariables(value);
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
  const theme = resolveCourseThemeDefinition(resolved);
  return (
    <div
      className={`course-appearance ${className}`}
      data-course-template={resolved.template}
      data-course-typography={resolved.typography}
      data-course-surface={resolved.surface}
      data-course-world={resolved.worldTheme}
      data-course-card={theme.cardStyle}
      data-course-border={theme.borderStyle}
      data-course-pattern={theme.decorativePattern}
      data-course-icon={theme.iconStyle}
      data-course-lock={theme.lockStyle}
      data-course-button={theme.buttonStyle}
      data-course-atmosphere={resolved.atmosphere}
      data-course-reading-width={resolved.readingWidth}
      style={courseAppearanceVariables(resolved)}
    >
      {children}
    </div>
  );
}
