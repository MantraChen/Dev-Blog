import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { updateProject, deleteProject, createAuditLog } from "@/db/queries";
import { updateProjectSchema, parseId, safeParseBody } from "@/lib/validation";

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};

export const PUT: APIRoute = async ({ params, request }) => {
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

  const parsed = await safeParseBody(request, updateProjectSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: AUTH_HEADERS,
    });
  }

  const result = await updateProject(id, parsed.data);

  await createAuditLog({
    action: "project.update",
    resource: "project",
    resourceId: String(id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0] ?? null), {
    headers: AUTH_HEADERS,
  });
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

  await deleteProject(id);

  await createAuditLog({
    action: "project.delete",
    resource: "project",
    resourceId: String(id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: AUTH_HEADERS,
  });
};
