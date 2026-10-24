import type { APIRoute } from "astro";
import { getPublishedPostMetadata } from "@/db/queries";
import { escapeXml, feedDate } from "@/lib/feed-format";
import { withBase } from "@/lib/site-path";
import { seriesList } from "@/db/content";
import { getProjectList } from "@/db/queries";

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") || "https://example.com";
  const posts = await getPublishedPostMetadata();
  const projects = await getProjectList();
  const extra = [
    ...seriesList()
      .filter((item) => item.count > 0)
      .map((item) => `/series/${encodeURIComponent(item.slug)}`),
    ...projects.map((item) => `/projects/${item.slug}`),
    ...[
      ...new Set([
        ...posts.map((item) => item.publishedAt.slice(0, 4)),
        ...projects.flatMap((item) =>
          item.completedAt ? [item.completedAt.slice(0, 4)] : [],
        ),
      ]),
    ]
      .filter((year) => /^\d{4}$/.test(year))
      .map((year) => `/review/${year}`),
  ];

  const staticPages = [
    { url: "/", priority: "1.0" },
    { url: "/blog", priority: "0.9" },
    { url: "/projects", priority: "0.7" },
    { url: "/skills", priority: "0.6" },
    { url: "/timeline", priority: "0.6" },
    { url: "/archive", priority: "0.7" },
    { url: "/friends", priority: "0.5" },
    { url: "/series", priority: "0.8" },
    { url: "/now", priority: "0.6" },
    { url: "/review", priority: "0.6" },
    { url: "/subscribe", priority: "0.6" },
    ...extra.map((url) => ({ url, priority: "0.6" })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (p) => `  <url>
    <loc>${escapeXml(baseUrl + withBase(p.url))}</loc>
    <priority>${p.priority}</priority>
  </url>`,
  )
  .join("\n")}
${posts
  .map(
    (post) => `  <url>
    <loc>${escapeXml(baseUrl + withBase("/blog/" + encodeURIComponent(post.slug)))}</loc>
    ${feedDate(post.updatedAt || post.publishedAt) ? `<lastmod>${feedDate(post.updatedAt || post.publishedAt)}</lastmod>` : ""}
    <priority>0.8</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "no-cache",
    },
  });
};
