import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = await getCollection("blog", ({ data }) => !data.draft);

  return rss({
    title: "Dev Blog",
    description: "个人技术博客",
    site: context.site!,
    items: posts
      .sort(
        (a, b) =>
          b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
      )
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.publishedAt,
        description: post.data.description || post.data.title,
        link: `/blog/${post.id}/`,
      })),
  });
}
