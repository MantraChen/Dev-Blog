import pkg from "bcryptjs";
const { compare } = pkg;
import { RateLimiter } from "./rate-limit";
import { sqlite } from "../db";
import { parseSessionCookie } from "./request-security";
import { COOKIE_PATH, SESSION_COOKIE } from "./site-path";
export { getClientIp } from "./request-security";
import { createAdminSession, getAdminSession, deleteAdminSession, cleanExpiredSessions } from "@/db/queries";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Rate Limiting ──────────────────────────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new RateLimiter(sqlite, "login", LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
export const checkRateLimit = (ip: string) => loginAttempts.check(ip);
export const clearRateLimit = (ip: string) => loginAttempts.clear(ip);

// ─── Login ──────────────────────────────────────────────────────────

export async function login(password: string): Promise<string | null> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || !(await compare(password, hash))) {
    return null;
  }

  // Clean up expired sessions
  await cleanExpiredSessions();

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await createAdminSession(sessionId, expiresAt);

  return sessionId;
}

export async function validateSession(
  cookieHeader: string | null,
): Promise<boolean> {
  if (!cookieHeader) return false;

  const sessionId = parseSessionCookie(cookieHeader);
  if (!sessionId) return false;

  const session = await getAdminSession(sessionId);
  if (!session) return false;

  if (new Date(session.expiresAt) < new Date()) {
    await deleteAdminSession(sessionId);
    return false;
  }

  return true;
}

export async function logout(cookieHeader: string | null): Promise<void> {
  if (!cookieHeader) return;
  const sessionId = parseSessionCookie(cookieHeader);
  if (sessionId) {
    await deleteAdminSession(sessionId);
  }
}

export function makeSessionCookie(sessionId: string): string {
  const expires = new Date(Date.now() + SESSION_DURATION_MS).toUTCString();
  return `${SESSION_COOKIE}=${sessionId}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict; Expires=${expires}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
