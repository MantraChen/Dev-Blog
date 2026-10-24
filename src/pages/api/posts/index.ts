import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getAllPosts, createPost, createAuditLog } from "@/db/queries";
import { createPostSchema, safeParseBody } from "@/lib/validation";

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: AUTH_HEADERS,
    });
  }

  const posts = await getAllPosts(url.searchParams.get("summary") === "1");
  return new Response(JSON.stringify(posts), {
    headers: AUTH_HEADERS,
  });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: AUTH_HEADERS,
    });
  }

  const parsed = await safeParseBody(request, createPostSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: parsed.status,
      headers: AUTH_HEADERS,
    });
  }

  const result = createPost(parsed.data);

  await createAuditLog({
    action: "post.create",
    resource: "post",
    resourceId: String(result[0].id),
    ip: getClientIp(clientAddress),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: AUTH_HEADERS,
  });
};
