import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseWorld, { type WorldTheme } from "@/components/CourseWorld";

const spaceWorlds: Record<string, { label: string; privacy: string; theme: WorldTheme }> = {
  personal: { label: "Personal study", privacy: "Only you", theme: "archive" },
  private: { label: "Private group", privacy: "Invitation only", theme: "workshop" },
  unlisted: { label: "Quiet classroom", privacy: "Private link", theme: "village" },
  organization: { label: "Organisation", privacy: "Managed access", theme: "city-night" },
  public: { label: "Public community", privacy: "Discoverable", theme: "garden" },
};

export default function SpacePlaceCard({ space, membership }: { space: { id: string; name: string; type: string; status: string }; membership: { role: string; status: string } }) {
  const world = spaceWorlds[space.type] ?? spaceWorlds.private;
  return (
    <article className="group overflow-hidden rounded-[1.45rem] border border-line bg-card shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-pop">
      <Link href={`/spaces/${space.id}`} className="block" aria-label={`Open ${space.name}`}>
        <div className="relative min-h-44"><CourseWorld seed={space.id} title={space.name} theme={world.theme} className="absolute inset-0" /><span className="absolute left-4 top-4 rounded-full border border-white/15 bg-pine/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-white backdrop-blur-sm">{world.label}</span><span className="absolute bottom-4 right-4 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-pine/60 text-white backdrop-blur-sm"><AppIcon name="arrow" className="h-4 w-4" /></span></div>
        <div className="p-5 sm:p-6"><h2 className="display text-3xl leading-[1.02]">{space.name}</h2><div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs"><div><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-soft">Your role</p><p className="mt-1 font-semibold capitalize">{membership.role}</p></div><div><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-ink-soft">Access</p><p className="mt-1 font-semibold">{world.privacy}</p></div></div>{space.status !== "active" && <p className="mt-4 rounded-lg bg-amber/15 px-3 py-2 text-xs font-semibold capitalize text-ink">{space.status.replaceAll("_", " ")}</p>}</div>
      </Link>
    </article>
  );
}
