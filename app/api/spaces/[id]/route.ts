import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { spaceApiError } from "@/lib/space-api";
import {
  getSpaceDashboard,
  updateSpaceLifecycle,
  updateSpacePolicies,
  updateSpaceProfile,
} from "@/lib/spaces";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import type { SpaceRow } from "@/lib/spaces";
import type { SpaceStatus } from "@/lib/space-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  try {
    return NextResponse.json(await getSpaceDashboard(user.id, (await params).id));
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}

const DISCOVERY = new Set(["owner_only", "hidden", "unlisted", "organization", "public"]);
const ENTRY = new Set(["owner_only", "invitation", "approval", "managed", "open", "moderated"]);
const DIRECTORY = new Set(["owner_only", "managers", "members", "public"]);
const SHARING = new Set(["owner_only", "members", "organization", "public"]);
const STATUSES = new Set<SpaceStatus>(["active", "suspended", "archived", "deletion_scheduled"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    action?: "profile" | "policies" | "lifecycle";
    profile?: Parameters<typeof updateSpaceProfile>[2];
    policies?: Partial<Pick<SpaceRow, "discovery_policy" | "entry_policy" | "member_directory_policy" | "content_sharing_policy">>;
    status?: SpaceStatus;
  };
  const spaceId = (await params).id;
  try {
    if (body.action === "profile" && body.profile) {
      return NextResponse.json({ space: await updateSpaceProfile(user.id, spaceId, body.profile) });
    }
    if (body.action === "policies" && body.policies) {
      const p = body.policies;
      if ((p.discovery_policy && !DISCOVERY.has(p.discovery_policy)) ||
          (p.entry_policy && !ENTRY.has(p.entry_policy)) ||
          (p.member_directory_policy && !DIRECTORY.has(p.member_directory_policy)) ||
          (p.content_sharing_policy && !SHARING.has(p.content_sharing_policy))) {
        return NextResponse.json({ error: "Invalid Space policy" }, { status: 400 });
      }
      return NextResponse.json({ space: await updateSpacePolicies(user.id, spaceId, p) });
    }
    if (body.action === "lifecycle" && body.status && STATUSES.has(body.status)) {
      return NextResponse.json({ space: await updateSpaceLifecycle(user.id, spaceId, body.status) });
    }
    return NextResponse.json({ error: "Invalid Space update" }, { status: 400 });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
