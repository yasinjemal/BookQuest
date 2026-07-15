import { BLOCK_CHANNELS, type BlockType } from "./block-registry";

export const CHANNEL_PACKAGE_SCHEMA = "bookquest.channel-course.v1";
export type LearningChannel = "offline" | "chat";

export interface ChannelSourceBlock {
  id: string;
  blockType: string;
  content: unknown;
}

export interface ChannelSourceLesson {
  id: string | number;
  title: string;
  position: number;
  blocks: ChannelSourceBlock[];
}

export interface ChannelSourceModule {
  id: string | number;
  title: string;
  summary: string;
  position: number;
  lessons: ChannelSourceLesson[];
}

export interface ChannelCoursePackage {
  schema: typeof CHANNEL_PACKAGE_SCHEMA;
  packageId: string;
  channel: LearningChannel;
  generatedAt: string;
  accountBinding: string;
  course: { id: number; title: string; description: string; version: number };
  modules: Array<{
    id: string;
    title: string;
    summary: string;
    position: number;
    lessons: Array<{
      id: string;
      title: string;
      position: number;
      blocks: Array<{
        id: string;
        sourceType: string;
        renderedType: BlockType;
        content: unknown;
        fallbackApplied: boolean;
      }>;
    }>;
  }>;
  sync: {
    answerContract: "bookquest.learning-event.v2";
    idempotencyField: "eventId";
    progressContract: "bookquest.lesson-completion.v1";
    pendingEvidenceVisible: true;
    crossChannelResume: true;
  };
  limitations: string[];
}

const legacyTypes: Record<string, BlockType> = {
  concept: "explanation",
  example: "worked_example",
  quiz_mcq: "multiple_choice",
  quiz_truefalse: "true_false",
  quiz_fillblank: "fill_in",
  recap: "recap",
};

export function canonicalChannelBlockType(type: string): BlockType {
  const canonical = legacyTypes[type] ?? type;
  return Object.hasOwn(BLOCK_CHANNELS, canonical)
    ? canonical as BlockType
    : "explanation";
}

function readableText(content: unknown): string {
  if (typeof content === "string") return content.trim().slice(0, 4000);
  if (Array.isArray(content)) {
    return content.map(readableText).filter(Boolean).join("\n").slice(0, 4000);
  }
  if (!content || typeof content !== "object") return String(content ?? "");
  const value = content as Record<string, unknown>;
  const preferred = [
    value.body,
    value.transcript,
    value.explanation,
    value.problem,
    value.result,
    value.instructions,
    value.points,
    value.guidance,
    value.statement,
    value.question,
    value.prompt,
  ];
  return preferred.map(readableText).filter(Boolean).join("\n").slice(0, 4000);
}

function fallbackHeading(content: unknown, sourceType: string): string {
  if (content && typeof content === "object") {
    const value = content as Record<string, unknown>;
    const heading = value.heading ?? value.title ?? value.question ?? value.statement;
    if (typeof heading === "string" && heading.trim()) return heading.trim().slice(0, 200);
  }
  return `${sourceType.replaceAll("_", " ")} alternative`;
}

export function projectChannelBlock(
  block: ChannelSourceBlock,
  channel: LearningChannel
): ChannelCoursePackage["modules"][number]["lessons"][number]["blocks"][number] {
  const sourceType = canonicalChannelBlockType(block.blockType);
  const capability = BLOCK_CHANNELS[sourceType];
  const supported = channel === "offline" ? capability.offline : capability.chat;
  if (supported) {
    return {
      id: block.id,
      sourceType: block.blockType,
      renderedType: sourceType,
      content: block.content,
      fallbackApplied: false,
    };
  }
  const renderedType = capability.fallback ?? "explanation";
  return {
    id: block.id,
    sourceType: block.blockType,
    renderedType,
    content: {
      type: "explanation",
      heading: fallbackHeading(block.content, block.blockType),
      body: readableText(block.content) || "Open this lesson on the web for the full activity.",
      fallbackReason: `${block.blockType} is unavailable on ${channel}`,
    },
    fallbackApplied: true,
  };
}

export function buildChannelCoursePackage(input: {
  packageId: string;
  generatedAt: string;
  channel: LearningChannel;
  accountBinding: string;
  course: { id: number; title: string; description: string; version: number };
  modules: ChannelSourceModule[];
}): ChannelCoursePackage {
  return {
    schema: CHANNEL_PACKAGE_SCHEMA,
    packageId: input.packageId,
    channel: input.channel,
    generatedAt: input.generatedAt,
    accountBinding: input.accountBinding,
    course: input.course,
    modules: [...input.modules]
      .sort((a, b) => a.position - b.position)
      .map((module) => ({
        id: String(module.id),
        title: module.title,
        summary: module.summary,
        position: module.position,
        lessons: [...module.lessons]
          .sort((a, b) => a.position - b.position)
          .map((lesson) => ({
            id: String(lesson.id),
            title: lesson.title,
            position: lesson.position,
            blocks: lesson.blocks.map((block) => projectChannelBlock(block, input.channel)),
          })),
      })),
    sync: {
      answerContract: "bookquest.learning-event.v2",
      idempotencyField: "eventId",
      progressContract: "bookquest.lesson-completion.v1",
      pendingEvidenceVisible: true,
      crossChannelResume: true,
    },
    limitations: [
      "The package is bound to one signed-in account and must be cleared on sign-out from shared devices.",
      "Answers and completions remain pending until the device reconnects and the server confirms them.",
      "Media or activities unsupported by this channel are replaced with deterministic text alternatives.",
    ],
  };
}
