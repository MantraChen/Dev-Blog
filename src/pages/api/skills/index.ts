import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getSkillList, createSkill, createAuditLog } from "@/db/queries";
import { createSkillSchema, safeParseBody } from "@/lib/validation";

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

  const parsed = await safeParseBody(request, createSkillSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await createSkill(parsed.data);

  await createAuditLog({
    action: "skill.create",
    resource: "skill",
    resourceId: String(result[0].id),
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
