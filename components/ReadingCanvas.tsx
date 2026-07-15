import type { ReactNode } from "react";
import AppIcon, { type AppIconName } from "@/components/AppIcon";

const variants = {
  editorial: "border-line",
  insight: "border-teal/25",
  notebook: "border-dusk/25",
  journal: "border-moss/30",
} as const;

export default function ReadingCanvas({
  variant,
  label,
  title,
  icon,
  children,
}: {
  variant: keyof typeof variants;
  label: string;
  title: string;
  icon: AppIconName;
  children: ReactNode;
}) {
  return (
    <article data-reading-variant={variant} className={`course-reading-surface lesson-reading-card relative overflow-hidden border p-5 sm:p-6 ${variants[variant]}`}>
      {variant === "notebook" && <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(transparent 31px, rgba(82,106,140,.16) 32px)", backgroundSize: "100% 32px" }} aria-hidden="true" />}
      <div className="relative">
        <div className="lesson-block-label flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-teal"><span className="grid h-7 w-7 place-items-center rounded-full border border-current/20"><AppIcon name={icon} className="h-3.5 w-3.5" /></span>{label}</div>
        <h2 className="display mt-4 text-[clamp(1.8rem,5vw,2.7rem)] leading-[0.98]">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </article>
  );
}
