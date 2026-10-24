import type { APIRoute } from "astro";
import { addReaction, getReactionCounts, getPublicPostIdentity } from "@/db/queries";
import { reactionSchema, safeParseBody } from "@/lib/validation";

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");
  if (!slug || slug.length > 200) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!(await getPublicPostIdentity(slug))) return new Response(null, { status: 404 });
  const counts = await getReactionCounts(slug);
  return new Response(JSON.stringify(counts), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const parsed = await safeParseBody(request, reactionSchema);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const post = await getPublicPostIdentity(parsed.data.slug);
  if (!post) return new Response(null, { status: 404 });
  await addReaction(post.id, post.slug, parsed.data.emoji);
  const counts = await getReactionCounts(parsed.data.slug);

  return new Response(JSON.stringify(counts), {
    status: 201,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
