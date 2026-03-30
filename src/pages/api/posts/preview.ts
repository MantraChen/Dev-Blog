import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { marked } from "@/lib/markdown";

export const POST: APIRoute = async ({ request }) => {
  const session = validateSession(request.headers.get("cookie"));
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { content } = await request.json();
  if (typeof content !== "string") {
    return new Response("Missing content", { status: 400 });
  }

  const html = await marked.parse(content);
  return new Response(JSON.stringify({ html }), {
    headers: { "Content-Type": "application/json" },
  });
};
