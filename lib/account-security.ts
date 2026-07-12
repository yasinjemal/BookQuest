import {
  createAccountToken,
  getUserByEmail,
  getUserById,
  resetPasswordWithToken,
  verifyEmailWithToken,
  type AccountTokenPurpose,
} from "./db";
import { hashPassword, passwordValidationError } from "./passwords";
import {
  hashAccountToken,
  isAccountTokenShape,
  newAccountToken,
} from "./account-security-core";
import { sendTransactionalEmail } from "./email";
import {
  operationalSubject,
  recordOperationalError,
  recordOperationalEvent,
} from "./observability";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

async function issueToken(userId: number, purpose: AccountTokenPurpose) {
  const token = newAccountToken();
  const ttl = purpose === "verify_email" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await createAccountToken(
    userId,
    purpose,
    hashAccountToken(token),
    new Date(Date.now() + ttl).toISOString()
  );
  return token;
}

function appOrigin(origin: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is required for account-security email links");
  }
  return origin.replace(/\/$/, "");
}

export async function sendVerificationEmail(userId: number, origin: string) {
  const user = await getUserById(userId);
  if (!user || user.email_verified_at) return { sent: false as const };
  const token = await issueToken(user.id, "verify_email");
  const url = `${appOrigin(origin)}/api/auth/verification/confirm?token=${encodeURIComponent(token)}`;
  try {
    const delivery = await sendTransactionalEmail({
      to: user.email,
      subject: "Verify your BookQuest email",
      text: `Verify your BookQuest email address by opening this link:\n\n${url}\n\nThis link expires in 24 hours.`,
      html: `<p>Verify your BookQuest email address:</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
      idempotencyKey: `verify-${hashAccountToken(token).slice(0, 32)}`,
    });
    await recordOperationalEvent({
      eventType: "email.verification_requested",
      severity: "info",
      area: "account.email",
      subjectKey: operationalSubject("user", user.id),
      metadata: { delivery: delivery.mode },
    });
    return {
      sent: delivery.mode === "resend",
      previewUrl: delivery.mode === "preview" ? url : undefined,
    };
  } catch (error) {
    await recordOperationalError({
      eventType: "email.delivery_failed",
      area: "account.verification",
      error,
      subjectKey: operationalSubject("user", user.id),
    });
    return { sent: false as const };
  }
}

export async function requestPasswordReset(email: string, origin: string) {
  const user = await getUserByEmail(email);
  if (!user) return {};
  const token = await issueToken(user.id, "reset_password");
  const url = `${appOrigin(origin)}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    const delivery = await sendTransactionalEmail({
      to: user.email,
      subject: "Reset your BookQuest password",
      text: `Reset your BookQuest password by opening this link:\n\n${url}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`,
      html: `<p>Reset your BookQuest password:</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>`,
      idempotencyKey: `reset-${hashAccountToken(token).slice(0, 32)}`,
    });
    await recordOperationalEvent({
      eventType: "email.password_reset_requested",
      severity: "info",
      area: "account.password",
      subjectKey: operationalSubject("user", user.id),
      metadata: { delivery: delivery.mode },
    });
    return { previewUrl: delivery.mode === "preview" ? url : undefined };
  } catch (error) {
    await recordOperationalError({
      eventType: "email.delivery_failed",
      area: "account.password",
      error,
      subjectKey: operationalSubject("user", user.id),
    });
    return {};
  }
}

export async function confirmEmailToken(token: string): Promise<boolean> {
  if (!isAccountTokenShape(token)) return false;
  return verifyEmailWithToken(hashAccountToken(token));
}

export async function confirmPasswordReset(token: string, password: string) {
  const error = passwordValidationError(password);
  if (error) return { error };
  if (!isAccountTokenShape(token)) {
    return { error: "This reset link is invalid or expired." };
  }
  const userId = await resetPasswordWithToken(
    hashAccountToken(token),
    hashPassword(password)
  );
  if (!userId) return { error: "This reset link is invalid or expired." };
  await recordOperationalEvent({
    eventType: "account.password_reset",
    severity: "info",
    area: "account.password",
    subjectKey: operationalSubject("user", userId),
  });
  return { ok: true as const };
}
