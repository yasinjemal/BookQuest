import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/pg", () => ({
  many: vi.fn(),
  one: vi.fn(),
  q: vi.fn(),
  tx: vi.fn(),
}));

import {
  AiBudgetConfigurationError,
  AiBudgetExceededError,
  aiBudgetWindow,
  createBudgetedMessage,
  estimateMaximumCostMicros,
  priceUsageMicros,
  resolveAiBudgetPolicy,
} from "../lib/ai-budget";
import * as pg from "../lib/pg";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("AI cost policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults to a $5 Johannesburg day and current Sonnet pricing", () => {
    expect(resolveAiBudgetPolicy("claude-sonnet-4-6", {})).toEqual({
      limitMicros: 5_000_000,
      timeZone: "Africa/Johannesburg",
      inputUsdPerMillion: 3,
      outputUsdPerMillion: 15,
    });
    expect(
      aiBudgetWindow(
        new Date("2026-07-16T10:00:00.000Z"),
        "Africa/Johannesburg"
      )
    ).toEqual({
      budgetDay: "2026-07-16",
      retryAt: "2026-07-16T22:00:00.000Z",
    });
  });

  it("reserves the maximum output and prices settled usage in micro-dollars", () => {
    const pricing = { inputUsdPerMillion: 3, outputUsdPerMillion: 15 };
    expect(estimateMaximumCostMicros(1_000, 2_000, pricing)).toBe(33_300);
    expect(
      priceUsageMicros(
        { input_tokens: 1_000, output_tokens: 100 },
        pricing
      )
    ).toBe(4_500);
  });

  it("fails closed for unknown pricing and accepts an explicit paired override", () => {
    expect(() => resolveAiBudgetPolicy("private-model", {})).toThrow(
      AiBudgetConfigurationError
    );
    expect(
      resolveAiBudgetPolicy("private-model", {
        BOOKQUEST_AI_INPUT_USD_PER_MILLION: "2.5",
        BOOKQUEST_AI_OUTPUT_USD_PER_MILLION: "10",
      })
    ).toMatchObject({ inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 });
  });

  it("atomically refuses a call whose maximum charge would cross the cap", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("COALESCE(SUM")) {
        return { rows: [{ committed_micros: "4999000" }] };
      }
      return { rows: [] };
    });
    vi.mocked(pg.tx).mockImplementation(async (fn) => fn({ query } as never));
    const client = {
      messages: {
        countTokens: vi.fn().mockResolvedValue({ input_tokens: 100 }),
        create: vi.fn(),
      },
    };

    await expect(
      createBudgetedMessage(
        client as never,
        {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          operation: "practice.fresh",
          subjectType: "practice",
          subjectId: "1:2",
        },
        {
          model: "claude-sonnet-4-6",
          max_tokens: 100,
          messages: [{ role: "user", content: "Question" }],
        }
      )
    ).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(query.mock.calls[0]?.[0]).toContain("pg_advisory_xact_lock");
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("settles provider usage before parsing structured output", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("COALESCE(SUM")) {
        return { rows: [{ committed_micros: "0" }] };
      }
      if (sql.includes("INSERT INTO ai_usage_events")) {
        return { rows: [{ id: "42" }] };
      }
      return { rows: [] };
    });
    vi.mocked(pg.tx).mockImplementation(async (fn) => fn({ query } as never));
    vi.mocked(pg.q).mockResolvedValue({ rowCount: 1, rows: [] } as never);
    const format = {
      type: "json_schema" as const,
      schema: { type: "object" },
      parse: vi.fn((text: string) => JSON.parse(text) as { answer: number }),
    };
    const client = {
      messages: {
        countTokens: vi.fn().mockResolvedValue({ input_tokens: 50 }),
        create: vi.fn().mockResolvedValue({
          id: "msg_1",
          content: [{ type: "text", text: '{"answer":4}' }],
          usage: { input_tokens: 50, output_tokens: 10 },
        }),
      },
    };

    const response = await createBudgetedMessage(
      client as never,
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        operation: "course.outline",
        subjectType: "course",
        subjectId: 7,
      },
      {
        model: "claude-sonnet-4-6",
        max_tokens: 100,
        messages: [{ role: "user", content: "Outline" }],
        output_config: { format },
      } as never
    );

    expect(response.parsed_output).toEqual({ answer: 4 });
    expect(pg.q).toHaveBeenCalledWith(
      expect.stringContaining("status = 'settled'"),
      expect.arrayContaining(["42", 300])
    );
    expect(client.messages.countTokens).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ maxRetries: 0 })
    );
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ maxRetries: 0 })
    );
  });

  it("routes every paid generation path through the budget wrapper", () => {
    for (const path of [
      "lib/generator.ts",
      "lib/summary-generator.ts",
      "lib/studio-generator.ts",
    ]) {
      const code = source(path);
      expect(code).toContain("createBudgetedMessage(");
      expect(code).not.toContain("messages.parse(");
      expect(code).not.toContain('thinking: { type: "adaptive" }');
    }
    const budget = source("lib/ai-budget.ts");
    expect(budget).toContain("pg_advisory_xact_lock");
    expect(budget).toContain("reserved_cost_micros");
  });

  it("never starts paid generation from a read-only collection route", () => {
    for (const path of [
      "app/api/courses/route.ts",
      "app/api/summaries/route.ts",
      "app/api/summaries/[id]/route.ts",
    ]) {
      const code = source(path);
      expect(code).not.toContain("claimStalled");
      expect(code).not.toContain("kickGeneration(");
      expect(code).not.toContain("kickSummaryGeneration(");
      expect(code).not.toContain("after(");
    }
  });
});
