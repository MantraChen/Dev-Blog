import type { APIRoute } from "astro";
import { login, makeSessionCookie, checkRateLimit, clearRateLimit, getClientIp } from "@/lib/auth";
import { createAuditLog } from "@/db/queries";

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    await createAuditLog({ action: "login.rate_limited", ip });
    return new Response(
      JSON.stringify({ error: `Too many attempts. Try again in ${rateCheck.retryAfterSeconds}s` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateCheck.retryAfterSeconds),
        },
      },
    );
  }

  const body = await request.json();
  const password = body?.password;

  if (!password || typeof password !== "string") {
    return new Response(JSON.stringify({ error: "Password required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = await login(password);

  if (!sessionId) {
    await createAuditLog({ action: "login.failed", ip });
    return new Response(JSON.stringify({ error: "Invalid password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Successful login: clear rate limit and log
  clearRateLimit(ip);
  await createAuditLog({ action: "login.success", ip });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": makeSessionCookie(sessionId),
    },
  });
};
