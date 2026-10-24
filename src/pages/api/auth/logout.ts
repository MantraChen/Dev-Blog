import type { APIRoute } from "astro";
import { logout, clearSessionCookie, getClientIp, validateSession } from "@/lib/auth";
import { createAuditLog } from "@/db/queries";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  await logout(request.headers.get("cookie"));

  await createAuditLog({
    action: "logout.success",
    ip: getClientIp(clientAddress),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
};
