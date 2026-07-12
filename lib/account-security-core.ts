import crypto from "crypto";

export function newAccountToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAccountToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isAccountTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,100}$/.test(token);
}
