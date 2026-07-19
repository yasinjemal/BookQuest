import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { many, one, q, tx } from "./pg";

export const DEFAULT_AI_DAILY_BUDGET_USD = 5;
export const DEFAULT_AI_BUDGET_TIME_ZONE = "Africa/Johannesburg";

const AI_BUDGET_LOCK_NAMESPACE = 828173;
const INPUT_RESERVATION_SAFETY_FACTOR = 1.1;

type AiEnvironment = Readonly<Record<string, string | undefined>>;

interface ModelPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface AiBudgetPolicy extends ModelPricing {
  limitMicros: number;
  timeZone: string;
}

export interface AiBudgetContext {
  provider: string;
  model: string;
  operation: string;
  subjectType?: "course" | "summary" | "studio" | "practice";
  subjectId?: string | number;
  generationRunId?: string;
}

export interface AiBudgetStatus {
  budgetDay: string;
  limitMicros: number;
  committedMicros: number;
  remainingMicros: number;
  exhausted: boolean;
  retryAt: string;
  timeZone: string;
}

interface AiReservation extends ModelPricing {
  id: string;
  reservedCostMicros: number;
}

interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

type ParsedOutput<Params> = Params extends {
  output_config: { format: { parse(content: string): infer Output } };
}
  ? Output
  : unknown;

export type BudgetedMessage<Params> = Message & {
  parsed_output: ParsedOutput<Params> | null;
};

export class AiBudgetConfigurationError extends Error {
  readonly code = "ai_budget_not_configured";

  constructor(message: string) {
    super(message);
    this.name = "AiBudgetConfigurationError";
  }
}

export class AiBudgetExceededError extends Error {
  readonly code = "ai_budget_exhausted";

  constructor(
    public readonly limitMicros: number,
    public readonly committedMicros: number,
    public readonly retryAt: string,
    public readonly timeZone: string
  ) {
    super(
      `BookQuest's ${formatUsd(limitMicros)} daily AI safety limit has been reached. ` +
        `Completed work is safe. Try again after ${formatResetTime(retryAt, timeZone)}.`
    );
    this.name = "AiBudgetExceededError";
  }
}

function finiteNonNegative(
  name: string,
  raw: string | undefined,
  fallback?: number
): number {
  if (raw === undefined || raw.trim() === "") {
    if (fallback !== undefined) return fallback;
    throw new AiBudgetConfigurationError(`${name} is required for this AI model.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new AiBudgetConfigurationError(`${name} must be a non-negative number.`);
  }
  return value;
}

function configuredPricing(model: string, env: AiEnvironment): ModelPricing {
  const inputOverride = env.BOOKQUEST_AI_INPUT_USD_PER_MILLION?.trim();
  const outputOverride = env.BOOKQUEST_AI_OUTPUT_USD_PER_MILLION?.trim();
  if (inputOverride || outputOverride) {
    if (!inputOverride || !outputOverride) {
      throw new AiBudgetConfigurationError(
        "Set both BOOKQUEST_AI_INPUT_USD_PER_MILLION and " +
          "BOOKQUEST_AI_OUTPUT_USD_PER_MILLION when overriding model pricing."
      );
    }
    return {
      inputUsdPerMillion: finiteNonNegative(
        "BOOKQUEST_AI_INPUT_USD_PER_MILLION",
        inputOverride
      ),
      outputUsdPerMillion: finiteNonNegative(
        "BOOKQUEST_AI_OUTPUT_USD_PER_MILLION",
        outputOverride
      ),
    };
  }

  const normalized = model.trim().toLowerCase();
  if (normalized === "claude-sonnet-4-6" || normalized.startsWith("claude-sonnet-4-6-")) {
    return { inputUsdPerMillion: 3, outputUsdPerMillion: 15 };
  }
  if (normalized === "claude-opus-4-8" || normalized.startsWith("claude-opus-4-8-")) {
    return { inputUsdPerMillion: 5, outputUsdPerMillion: 25 };
  }
  if (normalized === "claude-haiku-4-5" || normalized.startsWith("claude-haiku-4-5-")) {
    return { inputUsdPerMillion: 1, outputUsdPerMillion: 5 };
  }
  throw new AiBudgetConfigurationError(
    `No safe pricing is registered for ${model}. Configure both per-million pricing variables before enabling it.`
  );
}

function validateTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    throw new AiBudgetConfigurationError(
      "BOOKQUEST_AI_BUDGET_TIME_ZONE must be a valid IANA time zone."
    );
  }
}

export function resolveAiBudgetPolicy(
  model: string,
  env: AiEnvironment = process.env
): AiBudgetPolicy {
  const dailyUsd = finiteNonNegative(
    "BOOKQUEST_AI_DAILY_BUDGET_USD",
    env.BOOKQUEST_AI_DAILY_BUDGET_USD,
    DEFAULT_AI_DAILY_BUDGET_USD
  );
  const limitMicros = Math.floor(dailyUsd * 1_000_000);
  if (!Number.isSafeInteger(limitMicros)) {
    throw new AiBudgetConfigurationError(
      "BOOKQUEST_AI_DAILY_BUDGET_USD is too large to account for safely."
    );
  }
  return {
    ...configuredPricing(model, env),
    limitMicros,
    timeZone: validateTimeZone(
      env.BOOKQUEST_AI_BUDGET_TIME_ZONE?.trim() || DEFAULT_AI_BUDGET_TIME_ZONE
    ),
  };
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function zonedMidnightUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const targetWallTime = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = targetWallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = zonedParts(new Date(candidate), timeZone);
    const currentWallTime = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second
    );
    candidate += targetWallTime - currentWallTime;
  }
  return new Date(candidate);
}

export function aiBudgetWindow(
  now: Date = new Date(),
  timeZone: string = DEFAULT_AI_BUDGET_TIME_ZONE
): { budgetDay: string; retryAt: string } {
  validateTimeZone(timeZone);
  const current = zonedParts(now, timeZone);
  const budgetDay = `${current.year}-${String(current.month).padStart(2, "0")}-${String(
    current.day
  ).padStart(2, "0")}`;
  const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const retryAt = zonedMidnightUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timeZone
  ).toISOString();
  return { budgetDay, retryAt };
}

function formatUsd(micros: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(micros / 1_000_000);
}

function formatResetTime(retryAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(retryAt));
}

function priceTokensMicros(tokens: number, priceUsdPerMillion: number): number {
  return Math.ceil(Math.max(0, tokens) * priceUsdPerMillion);
}

export function estimateMaximumCostMicros(
  inputTokens: number,
  maxOutputTokens: number,
  pricing: ModelPricing
): number {
  return (
    priceTokensMicros(
      Math.ceil(inputTokens * INPUT_RESERVATION_SAFETY_FACTOR),
      pricing.inputUsdPerMillion
    ) + priceTokensMicros(maxOutputTokens, pricing.outputUsdPerMillion)
  );
}

export function priceUsageMicros(usage: UsageLike, pricing: ModelPricing): number {
  const baseInput = Math.max(0, Number(usage.input_tokens) || 0);
  const output = Math.max(0, Number(usage.output_tokens) || 0);
  const cacheCreation = Math.max(
    0,
    Number(usage.cache_creation_input_tokens) || 0
  );
  const cacheRead = Math.max(0, Number(usage.cache_read_input_tokens) || 0);
  return (
    priceTokensMicros(baseInput, pricing.inputUsdPerMillion) +
    priceTokensMicros(output, pricing.outputUsdPerMillion) +
    priceTokensMicros(cacheCreation, pricing.inputUsdPerMillion * 1.25) +
    priceTokensMicros(cacheRead, pricing.inputUsdPerMillion * 0.1)
  );
}

async function committedForDay(budgetDay: string): Promise<number> {
  const row = await one<{ committed_micros: string }>(
    `SELECT COALESCE(SUM(
       CASE WHEN status = 'settled' THEN COALESCE(actual_cost_micros, reserved_cost_micros)
            ELSE reserved_cost_micros END
     ), 0)::text AS committed_micros
     FROM ai_usage_events WHERE budget_day = $1`,
    [budgetDay]
  );
  return Number(row?.committed_micros ?? 0);
}

export async function getAiBudgetStatus(
  model: string,
  env: AiEnvironment = process.env,
  now: Date = new Date()
): Promise<AiBudgetStatus> {
  const policy = resolveAiBudgetPolicy(model, env);
  const window = aiBudgetWindow(now, policy.timeZone);
  const committedMicros = await committedForDay(window.budgetDay);
  const remainingMicros = Math.max(0, policy.limitMicros - committedMicros);
  return {
    ...window,
    limitMicros: policy.limitMicros,
    committedMicros,
    remainingMicros,
    exhausted: remainingMicros <= 0,
    timeZone: policy.timeZone,
  };
}

export async function assertAiBudgetAvailable(
  model: string,
  env: AiEnvironment = process.env,
  now: Date = new Date()
): Promise<AiBudgetStatus> {
  const status = await getAiBudgetStatus(model, env, now);
  if (status.exhausted) {
    throw new AiBudgetExceededError(
      status.limitMicros,
      status.committedMicros,
      status.retryAt,
      status.timeZone
    );
  }
  return status;
}

async function reserveAiRequest(
  context: AiBudgetContext,
  inputTokens: number,
  maxOutputTokens: number,
  env: AiEnvironment = process.env,
  now: Date = new Date()
): Promise<AiReservation> {
  const policy = resolveAiBudgetPolicy(context.model, env);
  const { budgetDay, retryAt } = aiBudgetWindow(now, policy.timeZone);
  const reservedCostMicros = estimateMaximumCostMicros(
    inputTokens,
    maxOutputTokens,
    policy
  );
  return tx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [
      AI_BUDGET_LOCK_NAMESPACE,
      budgetDay,
    ]);
    const row = (
      await client.query<{ committed_micros: string }>(
        `SELECT COALESCE(SUM(
           CASE WHEN status = 'settled' THEN COALESCE(actual_cost_micros, reserved_cost_micros)
                ELSE reserved_cost_micros END
         ), 0)::text AS committed_micros
         FROM ai_usage_events WHERE budget_day = $1`,
        [budgetDay]
      )
    ).rows[0];
    const committedMicros = Number(row?.committed_micros ?? 0);
    if (committedMicros + reservedCostMicros > policy.limitMicros) {
      throw new AiBudgetExceededError(
        policy.limitMicros,
        committedMicros,
        retryAt,
        policy.timeZone
      );
    }
    const inserted = (
      await client.query<{ id: string }>(
        `INSERT INTO ai_usage_events
          (budget_day, provider, model, operation, subject_type, subject_id,
           generation_run_id, reserved_cost_micros, estimated_input_tokens,
           max_output_tokens, input_price_usd_per_million,
           output_price_usd_per_million, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id::text AS id`,
        [
          budgetDay,
          context.provider,
          context.model,
          context.operation,
          context.subjectType ?? null,
          context.subjectId === undefined ? null : String(context.subjectId),
          context.generationRunId ?? null,
          reservedCostMicros,
          inputTokens,
          maxOutputTokens,
          policy.inputUsdPerMillion,
          policy.outputUsdPerMillion,
          now.toISOString(),
        ]
      )
    ).rows[0];
    return {
      id: inserted.id,
      reservedCostMicros,
      inputUsdPerMillion: policy.inputUsdPerMillion,
      outputUsdPerMillion: policy.outputUsdPerMillion,
    };
  });
}

async function settleAiRequest(
  reservation: AiReservation,
  response: Message
): Promise<void> {
  const usage = response.usage as UsageLike;
  const actualCostMicros = priceUsageMicros(usage, reservation);
  await q(
    `UPDATE ai_usage_events
     SET status = 'settled', actual_cost_micros = $2,
         input_tokens = $3, output_tokens = $4,
         cache_creation_input_tokens = $5, cache_read_input_tokens = $6,
         provider_request_id = $7, completed_at = $8
     WHERE id = $1 AND status = 'reserved'`,
    [
      reservation.id,
      actualCostMicros,
      Number(usage.input_tokens) || 0,
      Number(usage.output_tokens) || 0,
      Number(usage.cache_creation_input_tokens) || 0,
      Number(usage.cache_read_input_tokens) || 0,
      response.id,
      new Date().toISOString(),
    ]
  );
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return `http_${status}`;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.slice(0, 120);
  }
  return "unknown_error";
}

async function markAiRequestUncertain(
  reservationId: string,
  error: unknown
): Promise<void> {
  await q(
    `UPDATE ai_usage_events
     SET status = 'uncertain', error_code = $2, completed_at = $3
     WHERE id = $1 AND status = 'reserved'`,
    [reservationId, errorCode(error), new Date().toISOString()]
  );
}

function countParams(params: MessageCreateParamsNonStreaming) {
  return {
    model: params.model,
    messages: params.messages,
    ...(params.system === undefined ? {} : { system: params.system }),
    ...(params.output_config === undefined
      ? {}
      : { output_config: params.output_config }),
    ...(params.thinking === undefined ? {} : { thinking: params.thinking }),
    ...(params.tools === undefined ? {} : { tools: params.tools }),
    ...(params.tool_choice === undefined ? {} : { tool_choice: params.tool_choice }),
  };
}

function parseStructuredOutput<Params extends MessageCreateParamsNonStreaming>(
  response: Message,
  params: Params
): ParsedOutput<Params> | null {
  const text = response.content.find((block) => block.type === "text")?.text;
  if (text === undefined) return null;
  const format = params.output_config?.format as
    | { type?: string; parse?: (content: string) => ParsedOutput<Params> }
    | undefined;
  if (format?.type !== "json_schema") return null;
  return format.parse
    ? format.parse(text)
    : (JSON.parse(text) as ParsedOutput<Params>);
}

/**
 * The only paid-message entry point. It counts input, atomically reserves the
 * maximum possible charge, disables SDK retries, settles usage before local
 * parsing/validation, and conservatively holds ambiguous failures.
 */
export async function createBudgetedMessage<
  Params extends MessageCreateParamsNonStreaming,
>(
  client: Anthropic,
  context: AiBudgetContext,
  params: Params,
  options: { timeout?: number } = {}
): Promise<BudgetedMessage<Params>> {
  // Fail before sending even a free token-count request when pricing is unsafe
  // or today's BookQuest-wide budget is already fully committed.
  await assertAiBudgetAvailable(context.model);
  const counted = await client.messages.countTokens(countParams(params), {
    maxRetries: 0,
    ...(options.timeout ? { timeout: options.timeout } : {}),
  });
  const reservation = await reserveAiRequest(
    context,
    Number(counted.input_tokens),
    params.max_tokens
  );
  let settled = false;
  try {
    const response = await client.messages.create(params, {
      maxRetries: 0,
      ...(options.timeout ? { timeout: options.timeout } : {}),
    });
    await settleAiRequest(reservation, response);
    settled = true;
    return {
      ...response,
      parsed_output: parseStructuredOutput(response, params),
    } as BudgetedMessage<Params>;
  } catch (error) {
    if (!settled) {
      await markAiRequestUncertain(reservation.id, error).catch(() => undefined);
    }
    throw error;
  }
}

export function aiBudgetErrorPayload(error: AiBudgetExceededError) {
  return {
    error: error.message,
    code: error.code,
    retryAt: error.retryAt,
    limitUsd: error.limitMicros / 1_000_000,
    timeZone: error.timeZone,
  };
}

export function aiBudgetRetryAfterSeconds(error: AiBudgetExceededError): number {
  return Math.max(1, Math.ceil((Date.parse(error.retryAt) - Date.now()) / 1000));
}

/** Privacy-safe operational view: no prompts or source text are ever stored. */
export async function listAiUsageForDay(budgetDay: string) {
  return many<{
    operation: string;
    model: string;
    request_count: number;
    committed_cost_micros: string;
  }>(
    `SELECT operation, model, COUNT(*)::int AS request_count,
       SUM(CASE WHEN status = 'settled' THEN COALESCE(actual_cost_micros, reserved_cost_micros)
                ELSE reserved_cost_micros END)::text AS committed_cost_micros
     FROM ai_usage_events WHERE budget_day = $1
     GROUP BY operation, model ORDER BY operation, model`,
    [budgetDay]
  );
}
