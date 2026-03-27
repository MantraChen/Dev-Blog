import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getTimelineList, createTimelineEntry, createAuditLog } from "@/db/queries";

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

  const body = await request.json();
  const result = await createTimelineEntry({
    title: body.title,
    description: body.description,
    type: body.type,
    date: body.date,
    tags: body.tags ?? null,
    url: body.url ?? null,
    sortOrder: body.sortOrder ?? 0,
  });

  await createAuditLog({
    action: "timeline.create",
    resource: "timeline",
    resourceId: String(result[0].id),
    detail: body.title,
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
