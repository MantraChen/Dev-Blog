import type { APIRoute } from "astro";
import { recordPostView, getPostViewCount, getPublicPostIdentity } from "@/db/queries";
import { getVisitor } from "@/lib/visitor";
import { viewSchema, safeParseBody } from "@/lib/validation";

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");

  if (!slug || slug.length > 200) {
    return new Response(JSON.stringify({ error: "slug required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!(await getPublicPostIdentity(slug))) return new Response(null, { status: 404 });
  const count = await getPostViewCount(slug);
  return new Response(JSON.stringify({ slug, views: count }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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

  const post = await getPublicPostIdentity(parsed.data.slug);
  if (!post) return new Response(null, { status: 404 });
  const visitor = getVisitor(request);
  await recordPostView(post.id, post.slug, visitor.key, visitor.bucket);
  const count = await getPostViewCount(parsed.data.slug);

  return new Response(JSON.stringify({ slug: parsed.data.slug, views: count }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": visitor.cookie },
  });
};
