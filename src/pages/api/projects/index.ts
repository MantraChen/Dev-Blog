import type { APIRoute } from "astro";
import { validateSession, getClientIp } from "@/lib/auth";
import { getProjectList, createProject, createAuditLog } from "@/db/queries";

export const GET: APIRoute = async () => {
  const projects = await getProjectList();
  return new Response(JSON.stringify(projects), {
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
  const result = await createProject({
    name: body.name,
    description: body.description,
    techStack: body.techStack ?? [],
    demoUrl: body.demoUrl ?? null,
    repoUrl: body.repoUrl ?? null,
    sortOrder: body.sortOrder ?? 0,
  });

  await createAuditLog({
    action: "project.create",
    resource: "project",
    resourceId: String(result[0].id),
    detail: body.name,
    ip: getClientIp(request),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
