import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { updatePost, deletePost, createAuditLog } from "@/db/queries";

export const PUT: APIRoute = async ({ params, request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = Number(params.id);
  const body = await request.json();
  const result = await updatePost(id, body);

  await createAuditLog({
    action: "post.update",
    resource: "post",
    resourceId: String(id),
    detail: body.title,
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
  await deletePost(id);

  await createAuditLog({
    action: "post.delete",
    resource: "post",
    resourceId: String(id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
