import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { marked } from "@/lib/markdown";
import { previewSchema, safeParseBody } from "@/lib/validation";

export const POST: APIRoute = async ({ request }) => {
  const session = await validateSession(request.headers.get("cookie"));
  if (!session) return new Response("Unauthorized", { status: 401 });

  const parsed = await safeParseBody(request, previewSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const html = await marked.parse(parsed.data.content);
  return new Response(JSON.stringify({ html }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
};
