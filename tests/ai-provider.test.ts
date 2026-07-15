import { describe, expect, it } from "vitest";
import {
  aiUnavailablePayload,
  createAiProvider,
  getAiAvailability,
  resolveAiConfiguration,
} from "../lib/ai-provider";

describe("installation AI provider policy", () => {
  it("preserves Anthropic as the compatible default", () => {
    expect(resolveAiConfiguration({ ANTHROPIC_API_KEY: "test-key" })).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
      baseUrl: null,
    });
    expect(getAiAvailability({ ANTHROPIC_API_KEY: "test-key" }).enabled).toBe(true);
  });

  it("supports an explicitly configured Anthropic-compatible endpoint", () => {
    const env = {
      BOOKQUEST_AI_PROVIDER: "anthropic-compatible",
      BOOKQUEST_AI_MODEL: "sovereign-model-v1",
      BOOKQUEST_AI_BASE_URL: "https://ai.example.test/v1/",
      BOOKQUEST_AI_API_KEY: "private-key",
    };
    expect(resolveAiConfiguration(env)).toEqual({
      provider: "anthropic-compatible",
      model: "sovereign-model-v1",
      baseUrl: "https://ai.example.test/v1",
    });
    expect(createAiProvider(env)).toMatchObject({
      provider: "anthropic-compatible",
      model: "sovereign-model-v1",
    });
  });

  it("makes disabled mode intentional and keeps manual content available", () => {
    const availability = getAiAvailability({ BOOKQUEST_AI_PROVIDER: "disabled" });
    expect(availability).toMatchObject({ enabled: false, mode: "disabled", provider: "disabled" });
    expect(aiUnavailablePayload(availability)).toMatchObject({
      code: "ai_disabled",
      manualModeAvailable: true,
    });
    expect(() => createAiProvider({ BOOKQUEST_AI_PROVIDER: "disabled" })).toThrow(
      /source-only draft/i
    );
  });

  it("fails closed for unsupported or incomplete provider configuration", () => {
    expect(getAiAvailability({ BOOKQUEST_AI_PROVIDER: "mystery" })).toMatchObject({
      enabled: false,
      mode: "misconfigured",
    });
    expect(
      getAiAvailability({
        BOOKQUEST_AI_PROVIDER: "anthropic-compatible",
        BOOKQUEST_AI_BASE_URL: "https://ai.example.test",
        BOOKQUEST_AI_API_KEY: "key",
      })
    ).toMatchObject({ enabled: false, mode: "misconfigured" });
    expect(
      getAiAvailability({
        BOOKQUEST_AI_PROVIDER: "anthropic-compatible",
        BOOKQUEST_AI_MODEL: "model",
        BOOKQUEST_AI_BASE_URL: "https://user:pass@ai.example.test",
        BOOKQUEST_AI_API_KEY: "key",
      })
    ).toMatchObject({ enabled: false, mode: "misconfigured" });
  });
});
