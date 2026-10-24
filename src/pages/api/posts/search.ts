import type { APIRoute } from "astro";
import { getPublicPostPage } from "@/db/queries";
import { toPostSummary } from "@/lib/post-summary";

export const GET: APIRoute = async ({ url }) => {
  const result = await getPublicPostPage({
    query: url.searchParams.get("q") || "",
    tag: url.searchParams.get("tag") || "",
    page: Number(url.searchParams.get("page") || 1),
    year: url.searchParams.get("year") || "",
    series: url.searchParams.get("series") || "",
  });
  const query = (url.searchParams.get("q") || "").trim().slice(0, 200);
  return Response.json(
    result.posts.map((post) => toPostSummary(post, query)),
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Total-Count": String(result.total),
        "X-Page": String(result.page),
        "X-Page-Size": String(result.pageSize),
      },
    },
  );
};
