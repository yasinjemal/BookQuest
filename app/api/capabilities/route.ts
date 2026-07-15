import { NextResponse } from "next/server";
import { getAiAvailability } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const ai = getAiAvailability();
  return NextResponse.json(
    {
      ai: {
        enabled: ai.enabled,
        mode: ai.mode,
        provider: ai.provider,
        model: ai.enabled ? ai.model : null,
        message: ai.message,
      },
      content: {
        manualAuthoring: true,
        sourceOnlyUpload: true,
        portableImport: true,
      },
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
