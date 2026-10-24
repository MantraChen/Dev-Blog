import rss from "@astrojs/rss";
import { getPublishedPostMetadata } from "@/db/queries";
import type { APIContext } from "astro";
import { feedDate } from "@/lib/feed-format";
import { withBase } from "@/lib/site-path";

export async function GET(context: APIContext) {
  const posts = await getPublishedPostMetadata();

  const response = await rss({
    title: "Howie Sun | Tech Blog",
    description: "Systems programming and engineering notes by Howie Sun",
    site: new URL(withBase("/"), context.site!),
    items: posts.map((post) => ({
      title: post.title,
      pubDate: feedDate(post.publishedAt) ? new Date(feedDate(post.publishedAt)!) : undefined,
      description: post.description || post.title,
      link: new URL(withBase(`/blog/${encodeURIComponent(post.slug)}`), context.site!).href,
    })),
  });
  response.headers.set("Cache-Control", "no-cache");
  return response;
}
