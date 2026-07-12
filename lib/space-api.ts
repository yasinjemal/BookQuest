import { NextResponse } from "next/server";
import {
  InvitationError,
  SpaceAccessError,
  SpaceConflictError,
} from "./spaces";

export function spaceApiError(error: unknown): NextResponse | undefined {
  if (error instanceof SpaceAccessError) {
    if (error.reason === "membership_required" || error.reason === "wrong_space") {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Space action not allowed" }, { status: 403 });
  }
  if (error instanceof SpaceConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InvitationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.reason === "invitation_expired" ? 410 : 400 }
    );
  }
  return undefined;
}
