/** Shared branded loading state — one consistent look across every screen. */
export default function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-20 text-ink-soft"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-8 w-8 rounded-full border-[3px] border-line border-t-primary animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}
