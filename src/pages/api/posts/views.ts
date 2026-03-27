import type { APIRoute } from "astro";
import { recordPostView, getPostViewCount } from "@/db/queries";

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response(JSON.stringify({ error: "slug required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const count = await getPostViewCount(slug);
  return new Response(JSON.stringify({ slug, views: count }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const slug = body?.slug;

  if (!slug || typeof slug !== "string") {
    return new Response(JSON.stringify({ error: "slug required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await recordPostView(slug);
  const count = await getPostViewCount(slug);

  return new Response(JSON.stringify({ slug, views: count }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
