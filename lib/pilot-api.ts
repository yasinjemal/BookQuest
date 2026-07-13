import { NextResponse } from "next/server";
import { InstitutionalPilotError } from "./institutional-pilot";
import { spaceApiError } from "./space-api";

export function institutionalPilotApiError(error: unknown) {
  const spaceError = spaceApiError(error);
  if (spaceError) return spaceError;
  if (error instanceof InstitutionalPilotError) {
    return NextResponse.json(
      { error: error.message, missing: error.missing },
      { status: 409 },
    );
  }
  return undefined;
}
