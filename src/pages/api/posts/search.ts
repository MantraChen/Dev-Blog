import type { APIRoute } from "astro";
import { getPublicPostPage } from "@/db/queries";
import { toPostSummary } from "@/lib/post-summary";

export const GET: APIRoute = async ({ url }) => {
  const result = await getPublicPostPage({
    query: url.searchParams.get("q") || "", tag: url.searchParams.get("tag") || "",
    page: Number(url.searchParams.get("page") || 1),
  });
  return Response.json(result.posts.map(toPostSummary), { headers: {
    "Cache-Control": "no-store", "X-Total-Count": String(result.total),
    "X-Page": String(result.page), "X-Page-Size": String(result.pageSize),
  } });
};
