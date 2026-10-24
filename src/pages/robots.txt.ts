import type { APIRoute } from "astro";
import { withBase } from "@/lib/site-path";

export const GET: APIRoute = ({ site }) => new Response([
  "User-agent: *", `Allow: ${withBase("/")}`, `Disallow: ${withBase("/admin")}`,
  `Disallow: ${withBase("/api/")}`, "", `Sitemap: ${new URL(withBase("/sitemap.xml"), site).href}`, "",
].join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
