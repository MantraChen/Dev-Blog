import rss from "@astrojs/rss";
import { getPublishedPosts } from "@/db/queries";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = await getPublishedPosts();

  return rss({
    title: "Dev Blog",
    description: "Personal tech blog",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: new Date(post.publishedAt),
      description: post.description || post.title,
      link: `/blog/${post.slug}/`,
    })),
  });
}
