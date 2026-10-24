import { createHash, randomUUID } from "node:crypto";

export function getVisitor(request: Request) {
  const existing = request.headers.get("cookie")?.match(/(?:^|;\s*)blog_visitor=([\da-f-]{36})(?:;|$)/i)?.[1];
  const id = existing && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(existing) ? existing : randomUUID();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    key: createHash("sha256").update(id).digest("hex"),
    bucket: Math.floor(Date.now() / (30 * 60 * 1000)),
    cookie: `blog_visitor=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
  };
}
