import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  createUser,
  deleteSession,
  getSessionUser,
  getUserByEmail,
  type UserRow,
} from "./db";
import { hashPassword, verifyPassword } from "./passwords";

export { hashPassword, verifyPassword } from "./passwords";

export const SESSION_COOKIE = "bq_session";

export async function register(
  email: string,
  name: string,
  password: string,
  acceptedServiceTerms: boolean
): Promise<{ user?: UserRow; error?: string }> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (name.trim().length < 2) return { error: "Enter your name." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!acceptedServiceTerms) {
    return { error: "Accept the service terms and privacy notice to create an account." };
  }
  if (await getUserByEmail(email)) return { error: "An account with this email already exists." };
  return { user: await createUser(email, name, hashPassword(password)) };
}

export async function login(
  email: string,
  password: string
): Promise<{ user?: UserRow; error?: string }> {
  const user = await getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Wrong email or password." };
  }
  return { user };
}

export async function startSession(res: NextResponse, userId: number, days = 30) {
  const token = crypto.randomBytes(32).toString("hex");
  await createSession(userId, token, days);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: days * 24 * 3600,
  });
}

export async function endSession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Returns the logged-in user for a route handler request, or undefined. */
export async function getUser(req: NextRequest): Promise<UserRow | undefined> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(token) : undefined;
}

/** 401 helper: returns [user, undefined] or [undefined, response]. */
export async function requireUser(
  req: NextRequest
): Promise<[UserRow, undefined] | [undefined, NextResponse]> {
  const user = await getUser(req);
  if (!user) {
    return [undefined, NextResponse.json({ error: "Not signed in" }, { status: 401 })];
  }
  return [user, undefined];
}

/** Public view of a user (never expose password_hash). */
export function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    credits: user.credits,
    premium_until: user.premium_until,
    email_verified_at: user.email_verified_at,
    account_status: user.account_status,
    deletion_scheduled_at: user.deletion_scheduled_at,
  };
}
