import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BLOCK_SCHEMAS } from "./block-registry";
import {
  applyScopedRegeneration,
  beginScopedRegeneration,
  failScopedRegeneration,
  type RegenerationScope,
} from "./studio";

const client = new Anthropic();
const MODEL = "claude-opus-4-8";

function sourceText(sources: Array<{ id: string; title: string; extracted_content_json: string | null }>) {
  return sources
    .map((source) => {
      if (!source.extracted_content_json) return "";
      let readable = source.extracted_content_json;
      try {
        readable = JSON.stringify(JSON.parse(readable), null, 2);
      } catch {
        // Retain plain extracted text.
      }
      return `SOURCE VERSION ${source.id} — ${source.title}\n${readable}`;
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 60_000);
}

export async function regenerateStudioScope(
  userId: number,
  courseId: number,
  scope: RegenerationScope,
  instruction?: string
) {
  const context = await beginScopedRegeneration(userId, courseId, scope);
  try {
    const groundedSource = sourceText(context.sources);
    const replacements: Array<{ blockId: string; expectedRevision: number; content: unknown }> = [];
    for (const target of context.targets) {
      const schema = BLOCK_SCHEMAS[target.blockType];
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 2500,
        system: "Revise one learning block. Stay faithful to the supplied source. Return only content matching the requested block schema. Keep language clear and accessible. Never add unsupported claims.",
        messages: [{
          role: "user",
          content: `Block type: ${target.blockType}\nCurrent block:\n${JSON.stringify(target.content, null, 2)}\nCreator instruction: ${instruction?.trim() || "Improve clarity while preserving the learning objective."}\n\nApproved sources:\n${groundedSource}`,
        }],
        output_config: { format: zodOutputFormat(schema) },
      });
      if (!response.parsed_output) throw new Error("Regeneration returned no valid block");
      replacements.push({
        blockId: target.id,
        expectedRevision: target.expectedRevision,
        content: response.parsed_output,
      });
    }
    return await applyScopedRegeneration(userId, courseId, context.jobId, replacements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scoped regeneration failed";
    await failScopedRegeneration(context.jobId, message);
    throw error;
  }
}
