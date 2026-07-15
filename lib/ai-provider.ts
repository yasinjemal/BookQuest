import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_AI_MODEL = "claude-opus-4-8";
export const AI_DISABLED_MESSAGE =
  "AI generation is disabled for this installation. Create a source-only draft or edit/import approved content instead.";

export type AiProviderName = "anthropic" | "anthropic-compatible" | "disabled";
export type AiAvailabilityMode = "enabled" | "disabled" | "misconfigured";
export type AiEnvironment = Readonly<Record<string, string | undefined>>;

export interface AiConfiguration {
  provider: AiProviderName;
  model: string | null;
  baseUrl: string | null;
}

export interface AiAvailability extends AiConfiguration {
  enabled: boolean;
  mode: AiAvailabilityMode;
  message: string | null;
}

export class AiProviderError extends Error {
  constructor(
    public readonly code: "ai_disabled" | "ai_not_configured",
    message: string
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function providerName(raw: string | undefined): AiProviderName {
  const value = (raw || "anthropic").trim().toLowerCase();
  if (value === "disabled" || value === "off" || value === "none") return "disabled";
  if (value === "anthropic") return "anthropic";
  if (value === "anthropic-compatible" || value === "compatible") {
    return "anthropic-compatible";
  }
  throw new AiProviderError(
    "ai_not_configured",
    "BOOKQUEST_AI_PROVIDER must be anthropic, anthropic-compatible, or disabled."
  );
}

function compatibleBaseUrl(raw: string | undefined): string {
  if (!raw?.trim()) {
    throw new AiProviderError(
      "ai_not_configured",
      "BOOKQUEST_AI_BASE_URL is required for an Anthropic-compatible provider."
    );
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AiProviderError("ai_not_configured", "BOOKQUEST_AI_BASE_URL must be a valid URL.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new AiProviderError(
      "ai_not_configured",
      "BOOKQUEST_AI_BASE_URL must be an HTTP(S) URL without embedded credentials."
    );
  }
  return url.href.replace(/\/$/, "");
}

export function resolveAiConfiguration(
  env: AiEnvironment = process.env
): AiConfiguration {
  const provider = providerName(env.BOOKQUEST_AI_PROVIDER);
  if (provider === "disabled") {
    return { provider, model: null, baseUrl: null };
  }
  const configuredModel = env.BOOKQUEST_AI_MODEL?.trim();
  if (provider === "anthropic-compatible" && !configuredModel) {
    throw new AiProviderError(
      "ai_not_configured",
      "BOOKQUEST_AI_MODEL is required for an Anthropic-compatible provider."
    );
  }
  return {
    provider,
    model: configuredModel || DEFAULT_AI_MODEL,
    baseUrl:
      provider === "anthropic-compatible"
        ? compatibleBaseUrl(env.BOOKQUEST_AI_BASE_URL)
        : null,
  };
}

function providerKey(config: AiConfiguration, env: AiEnvironment): string | undefined {
  if (config.provider === "anthropic-compatible") {
    return env.BOOKQUEST_AI_API_KEY?.trim() || undefined;
  }
  return env.BOOKQUEST_AI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim() || undefined;
}

export function getAiAvailability(env: AiEnvironment = process.env): AiAvailability {
  try {
    const config = resolveAiConfiguration(env);
    if (config.provider === "disabled") {
      return { ...config, enabled: false, mode: "disabled", message: AI_DISABLED_MESSAGE };
    }
    if (!providerKey(config, env)) {
      return {
        ...config,
        enabled: false,
        mode: "misconfigured",
        message:
          "AI generation is unavailable until the provider key is configured. Manual authoring and portable imports still work.",
      };
    }
    return { ...config, enabled: true, mode: "enabled", message: null };
  } catch (error) {
    return {
      provider: "disabled",
      model: null,
      baseUrl: null,
      enabled: false,
      mode: "misconfigured",
      message:
        error instanceof Error
          ? error.message
          : "The AI provider configuration is invalid. Manual authoring still works.",
    };
  }
}

export function aiUnavailablePayload(availability = getAiAvailability()) {
  return {
    error: availability.message || "AI generation is unavailable.",
    code: availability.mode === "disabled" ? "ai_disabled" : "ai_not_configured",
    manualModeAvailable: true,
  };
}

export function createAiProvider(env: AiEnvironment = process.env) {
  const availability = getAiAvailability(env);
  if (!availability.enabled || !availability.model) {
    throw new AiProviderError(
      availability.mode === "disabled" ? "ai_disabled" : "ai_not_configured",
      availability.message || "AI generation is unavailable."
    );
  }
  const apiKey = providerKey(availability, env);
  if (!apiKey) {
    throw new AiProviderError("ai_not_configured", "The AI provider key is not configured.");
  }
  return {
    client: new Anthropic({
      apiKey,
      ...(availability.baseUrl ? { baseURL: availability.baseUrl } : {}),
    }),
    provider: availability.provider,
    model: availability.model,
  };
}
