import type { APIRoute } from "astro";
import {
  login,
  makeSessionCookie,
  checkRateLimit,
  clearRateLimit,
  getClientIp,
} from "@/lib/auth";
import { createAuditLog } from "@/db/queries";
import { loginSchema, safeParseBody } from "@/lib/validation";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = getClientIp(clientAddress);

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: `Too many attempts. Try again in ${rateCheck.retryAfterSeconds}s`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateCheck.retryAfterSeconds),
        },
      },
    );
  }

  const parsed = await safeParseBody(request, loginSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: parsed.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = await login(
    parsed.data.password,
    request.headers.get("user-agent") || "Unknown device",
  );

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
