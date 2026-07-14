import LtiLaunchClient from "@/components/LtiLaunchClient";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function LtiLaunchPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  noStore();
  const ticket = (await searchParams).ticket;
  const safeTicket = ticket && /^[A-Za-z0-9_-]{43}$/.test(ticket) ? ticket : "";
  return <LtiLaunchClient ticket={safeTicket} />;
}
