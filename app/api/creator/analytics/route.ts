import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCreatorAnalytics } from "@/lib/public-product";
export async function GET(request: NextRequest) { const [user, unauth] = await requireUser(request); if (!user) return unauth; return NextResponse.json(await getCreatorAnalytics(user.id)); }
