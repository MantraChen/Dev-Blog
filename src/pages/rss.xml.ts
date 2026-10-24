import rss from "@astrojs/rss";
import { feedFilters, feedPosts } from "@/lib/subscriptions";
import type { APIContext } from "astro";
import { feedDate } from "@/lib/feed-format";
import { withBase } from "@/lib/site-path";

export async function GET(context: APIContext) {
  const parsed = feedFilters.safeParse(
    Object.fromEntries(context.url.searchParams),
  );
  if (!parsed.success)
    return Response.json({ error: "Invalid feed filters" }, { status: 400 });
  const posts = feedPosts(parsed.data);
  const scope = Object.values(parsed.data).filter(Boolean).join(" / ");

  const response = await rss({
    title: "Howie Sun | Tech Blog" + (scope ? ` · ${scope}` : ""),
    description: "Systems programming and engineering notes by Howie Sun",
    site: new URL(withBase("/"), context.site!),
    items: posts.map((post) => ({
      title: post.title,
      pubDate: feedDate(post.publishedAt)
        ? new Date(feedDate(post.publishedAt)!)
        : undefined,
      description: post.description || post.title,
      link: new URL(
        withBase(`/blog/${encodeURIComponent(post.slug)}`),
        context.site!,
      ).href,
    })),
  });
  response.headers.set("Cache-Control", "no-cache");
  return response;
}
