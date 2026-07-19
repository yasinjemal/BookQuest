"use client";

import Link from "next/link";
import { useEffect } from "react";
import AppIcon from "@/components/AppIcon";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return <section className="page-wrap"><div className="panel mx-auto mt-8 max-w-xl text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-no-soft text-no-deep"><AppIcon name="compass" className="h-5 w-5" /></span><p className="section-label mt-5">Something interrupted the journey</p><h1 className="display mt-3 text-4xl">Your work is still safe.</h1><p role="alert" className="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-soft">BookQuest could not finish opening this screen. Try it again; if the problem continues, return home and reopen your work.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={reset} className="btn-primary">Try again</button><Link href="/" className="quiet-button">Return home</Link></div>{error.digest && <p className="mt-5 text-xs text-ink-soft">Reference: {error.digest}</p>}</div></section>;
}
