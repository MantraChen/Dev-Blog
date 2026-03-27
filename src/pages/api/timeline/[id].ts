import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { updateTimelineEntry, deleteTimelineEntry } from "@/db/queries";

export const PUT: APIRoute = async ({ params, request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = Number(params.id);
  const body = await request.json();
  const result = await updateTimelineEntry(id, body);

  return new Response(JSON.stringify(result[0] ?? null), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = Number(params.id);
  await deleteTimelineEntry(id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
