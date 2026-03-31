import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { deleteStatus, createAuditLog } from "@/db/queries";
import { parseId } from "@/lib/validation";

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: AUTH_HEADERS,
    });
  }

  const id = parseId(params.id);
  if (!id) {
    return new Response(JSON.stringify({ error: "Invalid ID" }), {
      status: 400,
      headers: AUTH_HEADERS,
    });
  }

  await deleteStatus(id);

  await createAuditLog({
    action: "status.delete",
    resource: "status",
    resourceId: String(id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: AUTH_HEADERS,
  });
};
