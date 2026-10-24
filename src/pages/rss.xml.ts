import rss from "@astrojs/rss";
import { getPublishedPostMetadata } from "@/db/queries";
import type { APIContext } from "astro";
import { feedDate } from "@/lib/feed-format";

export async function GET(context: APIContext) {
  const posts = await getPublishedPostMetadata();

  const response = await rss({
    title: "Howie Sun | Tech Blog",
    description: "Systems programming and engineering notes by Howie Sun",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: feedDate(post.publishedAt) ? new Date(feedDate(post.publishedAt)!) : undefined,
      description: post.description || post.title,
      link: `/blog/${encodeURIComponent(post.slug)}`,
    })),
  });
  response.headers.set("Cache-Control", "no-cache");
  return response;
}
