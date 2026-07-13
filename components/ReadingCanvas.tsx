import type { ReactNode } from "react";
import AppIcon, { type AppIconName } from "@/components/AppIcon";

const variants = {
  editorial: "border-line bg-ivory shadow-[0_24px_70px_rgba(24,48,41,0.08)]",
  notebook: "border-dusk/25 bg-sky/35 shadow-[0_24px_70px_rgba(43,62,78,0.08)]",
  journal: "border-moss/30 bg-go-soft/70 shadow-[0_24px_70px_rgba(24,48,41,0.07)]",
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
    <article className={`relative overflow-hidden rounded-[1.6rem] border p-6 sm:p-9 ${variants[variant]}`}>
      {variant === "notebook" && <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(transparent 31px, rgba(82,106,140,.16) 32px)", backgroundSize: "100% 32px" }} aria-hidden="true" />}
      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-teal"><span className="grid h-8 w-8 place-items-center rounded-full border border-current/20"><AppIcon name={icon} className="h-4 w-4" /></span>{label}</div>
        <h2 className="display mt-5 text-[clamp(2.25rem,8vw,3.8rem)] leading-[0.95]">{title}</h2>
        <div className="mt-6">{children}</div>
      </div>
    </article>
  );
}
