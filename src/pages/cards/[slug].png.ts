import type { APIRoute } from "astro";
import { getPostBySlug } from "@/db/queries";
import { shareCard } from "@/lib/share-card";
import { HttpError } from "@/lib/http-error";
export const GET: APIRoute = async ({ params, request, url }) => {
  const post = await getPostBySlug(params.slug!);
  if (!post || post.draft || post.hidden)
    return new Response(null, { status: 404 });
  try {
    const card = await shareCard(post);
    const headers = {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: card.etag,
      "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="${post.slug.replace(/[^a-z0-9-]/g, "_").slice(0, 180)}.png"`,
    };
    if (request.headers.get("if-none-match") === card.etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(card.bytes), { headers });
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
};
