import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getFriendList, createFriend, createAuditLog } from "@/db/queries";

export const GET: APIRoute = async () => {
  const friends = await getFriendList();
  return new Response(JSON.stringify(friends), {
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
  const result = await createFriend({
    name: body.name,
    url: body.url,
    avatar: body.avatar || null,
    description: body.description || null,
    sortOrder: body.sortOrder ?? 0,
  });

  await createAuditLog({
    action: "friend.create",
    resource: "friend",
    resourceId: String(result[0].id),
    detail: body.name,
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
