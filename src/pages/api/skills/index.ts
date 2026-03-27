import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getSkillList, createSkill, createAuditLog } from "@/db/queries";

export const GET: APIRoute = async () => {
  const skillList = await getSkillList();
  return new Response(JSON.stringify(skillList), {
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
  const result = await createSkill({
    name: body.name,
    category: body.category,
    level: body.level ?? 3,
    iconSlug: body.iconSlug ?? null,
    sortOrder: body.sortOrder ?? 0,
  });

  await createAuditLog({
    action: "skill.create",
    resource: "skill",
    resourceId: String(result[0].id),
    detail: body.name,
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
