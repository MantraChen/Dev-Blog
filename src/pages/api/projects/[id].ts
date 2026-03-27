import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { updateProject, deleteProject, createAuditLog } from "@/db/queries";

export const PUT: APIRoute = async ({ params, request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = Number(params.id);
  const body = await request.json();
  const result = await updateProject(id, body);

  await createAuditLog({
    action: "project.update",
    resource: "project",
    resourceId: String(id),
    detail: body.name,
    ip: getClientIp(request),
  });

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
  await deleteProject(id);

  await createAuditLog({
    action: "project.delete",
    resource: "project",
    resourceId: String(id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
