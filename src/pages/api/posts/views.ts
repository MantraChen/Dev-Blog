import type { APIRoute } from "astro";
import { recordPostView, getPostViewCount } from "@/db/queries";
import { viewSchema, safeParseBody } from "@/lib/validation";

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");

  if (!slug || slug.length > 200) {
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
  const parsed = await safeParseBody(request, viewSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await recordPostView(parsed.data.slug);
  const count = await getPostViewCount(parsed.data.slug);

  return new Response(JSON.stringify({ slug: parsed.data.slug, views: count }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
