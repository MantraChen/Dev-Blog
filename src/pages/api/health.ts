import type { APIRoute } from "astro";
import { sqlite } from "@/db";

export const GET: APIRoute = () => {
  try {
    sqlite.prepare("SELECT postId, visitorKey FROM post_views LIMIT 0").all();
    return Response.json({ status: "ok", release: import.meta.env.PUBLIC_RELEASE_ID || "development" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
