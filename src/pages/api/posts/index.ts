import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { getAllPosts, createPost } from "@/db/queries";

export const GET: APIRoute = async ({ request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const posts = await getAllPosts();
  return new Response(JSON.stringify(posts), {
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
  const result = await createPost({
    title: body.title,
    slug: body.slug,
    description: body.description ?? "",
    content: body.content ?? "",
    tags: body.tags ?? [],
    featured: body.featured ?? false,
    draft: body.draft ?? true,
    publishedAt: body.publishedAt ?? new Date().toISOString(),
  });

  return new Response(JSON.stringify(result[0]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
