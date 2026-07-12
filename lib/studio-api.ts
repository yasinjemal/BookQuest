import { NextResponse } from "next/server";
import { spaceApiError } from "./space-api";
import { StudioConflictError } from "./studio";

export function studioApiError(error: unknown): NextResponse | undefined {
  const spaceResponse = spaceApiError(error);
  if (spaceResponse) return spaceResponse;
  if (error instanceof StudioConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON content" }, { status: 400 });
  }
  return undefined;
}
