import { NextResponse } from "next/server";
import { InstitutionalConflictError } from "./institutional";
import { spaceApiError } from "./space-api";

export function institutionalApiError(error: unknown): NextResponse | undefined {
  const space = spaceApiError(error);
  if (space) return space;
  if (error instanceof InstitutionalConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return undefined;
}

