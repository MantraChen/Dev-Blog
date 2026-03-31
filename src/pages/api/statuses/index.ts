import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getLatestStatuses, createStatus, createAuditLog } from "@/db/queries";
import { createStatusSchema, safeParseBody } from "@/lib/validation";

export const GET: APIRoute = async ({ url }) => {
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 100
    ? limitParam
    : 20;
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

  const parsed = await safeParseBody(request, createStatusSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await createStatus(parsed.data.text);

  await createAuditLog({
    action: "status.create",
    resource: "status",
    resourceId: String(result[0].id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
