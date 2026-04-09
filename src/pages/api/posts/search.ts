import type { APIRoute } from "astro";
import { searchPosts } from "@/db/queries";

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get("q")?.trim();

  if (!query || query.length < 2 || query.length > 200) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = await searchPosts(query);
  // Only return published posts for public search
  const published = results.filter((p) => !p.draft);

  return new Response(
    JSON.stringify(
      published.map(({ id, title, slug, description, tags, publishedAt }) => ({
        id,
        title,
        slug,
        description,
        tags,
        publishedAt,
      })),
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};
