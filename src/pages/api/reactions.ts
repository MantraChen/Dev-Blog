import type { APIRoute } from "astro";
import { addReaction, getReactionCounts } from "@/db/queries";

const ALLOWED_EMOJIS = ["👍", "🎉", "❤️", "🚀", "👀", "🤔"];

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const counts = await getReactionCounts(slug);
  return new Response(JSON.stringify(counts), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { slug, emoji } = body;

  if (!slug || !emoji || !ALLOWED_EMOJIS.includes(emoji)) {
    return new Response(JSON.stringify({ error: "Invalid slug or emoji" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await addReaction(slug, emoji);
  const counts = await getReactionCounts(slug);

  return new Response(JSON.stringify(counts), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
