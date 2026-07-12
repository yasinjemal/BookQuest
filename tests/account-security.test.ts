import { afterEach, describe, expect, it } from "vitest";
import {
  hashAccountToken,
  isAccountTokenShape,
  newAccountToken,
} from "../lib/account-security-core";
import { sendTransactionalEmail } from "../lib/email";
import {
  hashPassword,
  passwordValidationError,
  verifyPassword,
} from "../lib/passwords";

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

describe("account security", () => {
  it("creates high-entropy tokens and stores only stable hashes", () => {
    const first = newAccountToken();
    const second = newAccountToken();
    expect(first).not.toBe(second);
    expect(isAccountTokenShape(first)).toBe(true);
    expect(hashAccountToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAccountToken(first)).toBe(hashAccountToken(first));
    expect(hashAccountToken(first)).not.toContain(first);
  });

  it("validates and securely hashes replacement passwords", () => {
    expect(passwordValidationError("short")).toContain("8 characters");
    expect(passwordValidationError("valid-password")).toBeUndefined();
    expect(passwordValidationError("x".repeat(201))).toContain("too long");
    const hash = hashPassword("valid-password");
    expect(hash).not.toContain("valid-password");
    expect(verifyPassword("valid-password", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("uses local preview delivery when no provider is configured", async () => {
    const delivery = await sendTransactionalEmail({
      to: "learner@example.test",
      subject: "Account security",
      text: "Open the link",
      html: "<p>Open the link</p>",
      idempotencyKey: "test-account-security",
    });
    expect(delivery).toEqual({ mode: "preview" });
  });
});
