import pkg from "bcryptjs";
const { compareSync } = pkg;
import { createAdminSession, getAdminSession, deleteAdminSession, cleanExpiredSessions } from "@/db/queries";

const SESSION_COOKIE = "admin_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Rate Limiting ──────────────────────────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return { allowed: true };
  }

  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.firstAttempt + LOGIN_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  record.count++;
  return { allowed: true };
}

export function clearRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// ─── Login ──────────────────────────────────────────────────────────

export async function login(password: string): Promise<string | null> {
  const hash = process.env.ADMIN_PASSWORD_HASH || import.meta.env.ADMIN_PASSWORD_HASH;
  if (!hash || !compareSync(password, hash)) {
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

  const sessionId = parseCookie(cookieHeader, SESSION_COOKIE);
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
  const sessionId = parseCookie(cookieHeader, SESSION_COOKIE);
  if (sessionId) {
    await deleteAdminSession(sessionId);
  }
}

export function makeSessionCookie(sessionId: string): string {
  const expires = new Date(Date.now() + SESSION_DURATION_MS).toUTCString();
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
