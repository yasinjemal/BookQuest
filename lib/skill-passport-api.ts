import { NextResponse } from "next/server";
import { SkillPassportError } from "./skill-passport";

export function skillPassportApiError(error: unknown) {
  if (!(error instanceof SkillPassportError)) return null;
  const notFound = /not found/i.test(error.message);
  return NextResponse.json(
    { error: error.message },
    { status: notFound ? 404 : 400, headers: { "Cache-Control": "no-store" } },
  );
}
