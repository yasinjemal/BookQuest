import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COURSE_ACCENT_CONTRAST, COURSE_ACCENT_HEX } from "../lib/course-appearance";
import { COURSE_SURFACE_TOKENS } from "../lib/course-themes";

function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function cssColor(name: string) {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`Missing --color-${name}`);
  return match[1];
}

describe("design-system contrast contracts", () => {
  it("keeps platform muted text readable on primary light surfaces", () => {
    const muted = cssColor("ink-soft");
    expect(contrast(muted, cssColor("paper"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, cssColor("card"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps teal actions readable with white text", () => {
    expect(contrast(cssColor("teal"), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("uses a two-tone focus treatment that survives light and dark surfaces", () => {
    expect(contrast(cssColor("focus"), cssColor("paper"))).toBeGreaterThanOrEqual(3);
    expect(contrast("#FFFFFF", cssColor("sidebar"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps every course accent label at AA contrast", () => {
    for (const accent of Object.keys(COURSE_ACCENT_HEX) as Array<keyof typeof COURSE_ACCENT_HEX>) {
      expect(contrast(COURSE_ACCENT_HEX[accent], COURSE_ACCENT_CONTRAST[accent]), accent).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps course muted text readable across every light surface", () => {
    for (const [name, tokens] of Object.entries(COURSE_SURFACE_TOKENS)) {
      for (const background of [tokens.page, tokens.canvas, tokens.raised]) {
        expect(contrast(tokens.inkSoft, background), `${name} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
