import type { APIRoute } from "astro";
import { logout, clearSessionCookie, getClientIp } from "@/lib/auth";
import { createAuditLog } from "@/db/queries";

export const POST: APIRoute = async ({ request }) => {
  await logout(request.headers.get("cookie"));

  await createAuditLog({
    action: "logout.success",
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
};
