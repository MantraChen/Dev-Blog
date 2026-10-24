import rss from "@astrojs/rss";
import { getPublishedPostMetadata } from "@/db/queries";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = await getPublishedPostMetadata();

  const response = await rss({
    title: "Howie Sun | Tech Blog",
    description: "Systems programming and engineering notes by Howie Sun",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: new Date(post.publishedAt),
      description: post.description || post.title,
      link: `/blog/${post.slug}/`,
    })),
  });
  response.headers.set("Cache-Control", "no-cache");
  return response;
}
