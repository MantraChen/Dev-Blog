import type { APIRoute } from "astro";
import { getPublishedPosts, getProjectList } from "@/db/queries";

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") || "https://example.com";
  const posts = await getPublishedPosts();
  const projects = await getProjectList();

  const staticPages = [
    { url: "/", priority: "1.0" },
    { url: "/blog", priority: "0.9" },
    { url: "/projects", priority: "0.7" },
    { url: "/skills", priority: "0.6" },
    { url: "/timeline", priority: "0.6" },
    { url: "/archive", priority: "0.7" },
    { url: "/friends", priority: "0.5" },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map((p) => `  <url>
    <loc>${baseUrl}${p.url}</loc>
    <priority>${p.priority}</priority>
  </url>`).join("\n")}
${posts.map((post) => `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${post.updatedAt || post.publishedAt}</lastmod>
    <priority>0.8</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
