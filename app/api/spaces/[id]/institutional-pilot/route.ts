import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  attestInstitutionalPilotGate,
  completeInstitutionalPilot,
  createInstitutionalPilot,
  getInstitutionalPilotDashboard,
  recordInstitutionalPilotObservation,
  reviseInstitutionalPilotPlan,
  type PilotGateAttestationInput,
  type PilotObservationInput,
  type PilotPlanInput,
} from "@/lib/institutional-pilot";
import { institutionalPilotApiError } from "@/lib/pilot-api";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, unauthenticated] = await requireUser(req);
  if (!user) return unauthenticated;
  try {
    return NextResponse.json({
      dashboard: await getInstitutionalPilotDashboard(user.id, (await params).id),
    });
  } catch (error) {
    const response = institutionalPilotApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, unauthenticated] = await requireUser(req);
  if (!user) return unauthenticated;
  const limit = await consumeRateLimit(
    RATE_LIMITS.spaceMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const spaceId = (await params).id;
  let body: {
    action?: "create" | "revise" | "observe" | "attest" | "complete";
    plan?: PilotPlanInput;
    observation?: PilotObservationInput;
    attestation?: PilotGateAttestationInput;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    if (body.action === "create" && body.plan) {
      return NextResponse.json(
        { pilot: await createInstitutionalPilot(user.id, spaceId, body.plan) },
        { status: 201 },
      );
    }
    if (body.action === "revise" && body.plan) {
      return NextResponse.json(
        { pilot: await reviseInstitutionalPilotPlan(user.id, spaceId, body.plan) },
        { status: 201 },
      );
    }
    if (body.action === "observe" && body.observation) {
      return NextResponse.json(
        { observation: await recordInstitutionalPilotObservation(user.id, spaceId, body.observation) },
        { status: 201 },
      );
    }
    if (body.action === "attest" && body.attestation) {
      return NextResponse.json(
        { attestation: await attestInstitutionalPilotGate(user.id, spaceId, body.attestation) },
        { status: 201 },
      );
    }
    if (body.action === "complete") {
      return NextResponse.json({ pilot: await completeInstitutionalPilot(user.id, spaceId) });
    }
    return NextResponse.json({ error: "Invalid institutional pilot action" }, { status: 400 });
  } catch (error) {
    const response = institutionalPilotApiError(error);
    if (response) return response;
    throw error;
  }
}
