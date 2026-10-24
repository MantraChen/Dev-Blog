import { createHmac, randomUUID } from "node:crypto";
import { sqlite } from "../db";
import { getClientIp } from "./request-security";
import { COOKIE_PATH, VISITOR_COOKIE } from "./site-path";

export function getVisitor(request: Request, clientAddress?: string) {
  const existing = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([\\da-f-]{36})(?:;|$)`, "i"))?.[1];
  const id = existing && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(existing) ? existing : randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const secret = (sqlite.prepare("SELECT value FROM app_settings WHERE key='visitor_secret'").get() as { value: string }).value;
  const ip = getClientIp(clientAddress || "unknown");
  // A keyed network identifier survives cookie deletion without storing raw IPs.
  // Same-address visitors are intentionally approximate; this is not identity proof.
  const identity = ip === "unknown" ? `cookie:${id}` : `network:${ip}`;
  return {
    key: createHmac("sha256", secret).update(identity).digest("hex"),
    bucket: Math.floor(Date.now() / (30 * 60 * 1000)),
    cookie: `${VISITOR_COOKIE}=${id}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
  };
}
