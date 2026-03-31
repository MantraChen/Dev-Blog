import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getTimelineList, createTimelineEntry, createAuditLog } from "@/db/queries";
import { createTimelineSchema, safeParseBody } from "@/lib/validation";

export const GET: APIRoute = async () => {
  const entries = await getTimelineList();
  return new Response(JSON.stringify(entries), {
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

  const parsed = await safeParseBody(request, createTimelineSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await createTimelineEntry(parsed.data);

  await createAuditLog({
    action: "timeline.create",
    resource: "timeline",
    resourceId: String(result[0].id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
