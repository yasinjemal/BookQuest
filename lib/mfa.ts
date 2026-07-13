import crypto from "crypto";
import { pool, tx, type Queryable } from "./pg";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const nowIso = () => new Date().toISOString();
const tokenHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfaError";
  }
}

function encryptionKey() {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.GENERATION_SECRET;
  if (!material && process.env.NODE_ENV === "production") throw new Error("MFA_ENCRYPTION_KEY is required in production");
  return crypto.createHash("sha256").update(material || "bookquest-local-mfa-key").digest();
}

function encodeBase32(input: Buffer) {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function decodeBase32(input: string) {
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new MfaError("Invalid authenticator secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function encryptSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(row: { secret_ciphertext: string; secret_iv: string; secret_auth_tag: string }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.secret_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function totpCode(secret: string, at = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(at / 1000 / stepSeconds);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, "0");
}

function validTotp(secret: string, code: string, at = Date.now()) {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some((window) => {
    const expected = totpCode(secret, at + window * 30_000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
  });
}

async function activeMethod(userId: number, exec: Queryable = pool) {
  return (await exec.query<{
    id: string;
    secret_ciphertext: string;
    secret_iv: string;
    secret_auth_tag: string;
  }>(
    `SELECT id,secret_ciphertext,secret_iv,secret_auth_tag FROM user_mfa_methods
     WHERE user_id=$1 AND method_type='totp' AND status='active'`,
    [userId]
  )).rows[0];
}

export async function hasActiveMfa(userId: number) {
  return !!(await activeMethod(userId));
}

export async function beginTotpEnrollment(userId: number, accountLabel: string) {
  const secret = encodeBase32(crypto.randomBytes(20));
  const encrypted = encryptSecret(secret);
  await tx(async (client) => {
    const existing = (await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM user_mfa_methods WHERE user_id=$1 AND method_type='totp' FOR UPDATE",
      [userId]
    )).rows[0];
    if (existing?.status === "active") throw new MfaError("Authenticator MFA is already active");
    if (existing) {
      await client.query(
        `UPDATE user_mfa_methods SET status='pending',secret_ciphertext=$2,
                secret_iv=$3,secret_auth_tag=$4,verified_at=NULL,disabled_at=NULL
         WHERE id=$1`,
        [existing.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
      );
      await client.query("DELETE FROM user_mfa_recovery_codes WHERE mfa_method_id=$1", [existing.id]);
    } else {
      await client.query(
        `INSERT INTO user_mfa_methods
          (user_id,method_type,status,secret_ciphertext,secret_iv,secret_auth_tag)
         VALUES ($1,'totp','pending',$2,$3,$4)`,
        [userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
      );
    }
  });
  const label = encodeURIComponent(`BookQuest:${accountLabel}`);
  return {
    secret,
    otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=BookQuest&algorithm=SHA1&digits=6&period=30`,
  };
}

export async function confirmTotpEnrollment(userId: number, code: string) {
  return tx(async (client) => {
    const method = (await client.query<{
      id: string; secret_ciphertext: string; secret_iv: string; secret_auth_tag: string;
    }>(
      `SELECT id,secret_ciphertext,secret_iv,secret_auth_tag FROM user_mfa_methods
       WHERE user_id=$1 AND method_type='totp' AND status='pending' FOR UPDATE`,
      [userId]
    )).rows[0];
    if (!method || !validTotp(decryptSecret(method), code)) throw new MfaError("Authenticator code is invalid");
    const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
    await client.query(
      "UPDATE user_mfa_methods SET status='active',verified_at=$2 WHERE id=$1",
      [method.id, nowIso()]
    );
    for (const recoveryCode of recoveryCodes) await client.query(
      "INSERT INTO user_mfa_recovery_codes (mfa_method_id,code_hash) VALUES ($1,$2)",
      [method.id, tokenHash(recoveryCode)]
    );
    return { recoveryCodes };
  });
}

export async function createLoginMfaChallenge(userId: number) {
  if (!(await hasActiveMfa(userId))) throw new MfaError("MFA is not active");
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO user_mfa_challenges (user_id,token_hash,expires_at)
     VALUES ($1,$2,$3)`,
    [userId, tokenHash(token), new Date(Date.now() + 5 * 60_000).toISOString()]
  );
  return token;
}

export async function consumeLoginMfaChallenge(challengeToken: string, code: string) {
  return tx(async (client) => {
    const challenge = (await client.query<{ id: string; user_id: number }>(
      `SELECT id,user_id FROM user_mfa_challenges
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 FOR UPDATE`,
      [tokenHash(challengeToken), nowIso()]
    )).rows[0];
    if (!challenge) throw new MfaError("MFA challenge is invalid or expired");
    const method = await activeMethod(challenge.user_id, client);
    if (!method) throw new MfaError("MFA is not active");
    let accepted = validTotp(decryptSecret(method), code);
    if (!accepted) {
      const recovery = (await client.query<{ id: string }>(
        `SELECT id FROM user_mfa_recovery_codes
         WHERE mfa_method_id=$1 AND code_hash=$2 AND used_at IS NULL FOR UPDATE`,
        [method.id, tokenHash(code.trim().toUpperCase())]
      )).rows[0];
      if (recovery) {
        accepted = true;
        await client.query("UPDATE user_mfa_recovery_codes SET used_at=$2 WHERE id=$1", [recovery.id, nowIso()]);
      }
    }
    if (!accepted) throw new MfaError("Authenticator or recovery code is invalid");
    await client.query("UPDATE user_mfa_challenges SET used_at=$2 WHERE id=$1", [challenge.id, nowIso()]);
    return { userId: challenge.user_id };
  });
}

export async function disableTotp(userId: number, code: string) {
  return tx(async (client) => {
    const method = await activeMethod(userId, client);
    if (!method || !validTotp(decryptSecret(method), code)) throw new MfaError("Authenticator code is invalid");
    await client.query("UPDATE user_mfa_methods SET status='disabled',disabled_at=$2 WHERE id=$1", [method.id, nowIso()]);
    await client.query("DELETE FROM user_mfa_recovery_codes WHERE mfa_method_id=$1", [method.id]);
    await client.query("DELETE FROM user_mfa_challenges WHERE user_id=$1 AND used_at IS NULL", [userId]);
    return { disabled: true };
  });
}

