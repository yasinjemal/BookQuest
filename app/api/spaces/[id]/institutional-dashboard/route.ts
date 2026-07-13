import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getInstitutionalDashboard } from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  try {
    return NextResponse.json(await getInstitutionalDashboard(user.id, (await params).id));
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}

