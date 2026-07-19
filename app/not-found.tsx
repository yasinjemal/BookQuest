import Link from "next/link";
import AppIcon from "@/components/AppIcon";

export default function NotFound() {
  return <section className="page-wrap"><div className="panel mx-auto mt-8 max-w-xl text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="compass" className="h-5 w-5" /></span><p className="section-label mt-5">Page not found</p><h1 className="display mt-3 text-4xl">That path is not in this world.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-soft">The page may have moved, or the link may no longer be available.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/" className="btn-primary">Return home</Link><Link href="/explore" className="quiet-button">Explore courses</Link></div></div></section>;
}
