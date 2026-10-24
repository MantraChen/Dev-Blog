import { isIP } from "node:net";
import { SESSION_COOKIE } from "./site-path";

// Use the adapter's validated address; never read arbitrary forwarding headers here.
// Production must bind to loopback behind the proxy described in deploy/setup.md.
export function getClientIp(clientAddress: string): string {
  return isIP(clientAddress) ? clientAddress : "unknown";
}

export function parseSessionCookie(header: string | null): string | null {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  } catch { return null; }
}

export function isSameOriginMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  // Non-browser API clients may omit Origin. Browsers cannot forge it.
  return request.headers.get("sec-fetch-site") !== "cross-site" &&
    (origin === null || origin === new URL(request.url).origin);
}
