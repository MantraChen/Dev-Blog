import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getLatestStatuses, createStatus, createAuditLog } from "@/db/queries";

export const GET: APIRoute = async ({ url }) => {
  const limit = Number(url.searchParams.get("limit")) || 20;
  const statuses = await getLatestStatuses(limit);
  return new Response(JSON.stringify(statuses), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const result = await createStatus(body.text);

  await createAuditLog({
    action: "status.create",
    resource: "status",
    resourceId: String(result[0].id),
    detail: body.text,
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
