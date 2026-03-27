import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { deleteStatus, createAuditLog } from "@/db/queries";

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = Number(params.id);
  await deleteStatus(id);

  await createAuditLog({
    action: "status.delete",
    resource: "status",
    resourceId: String(id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
