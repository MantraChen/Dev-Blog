import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { mediaIsPublic, readMedia } from "@/lib/media";
export const GET: APIRoute = async ({ request, params }) => {
  const id = params.id!;
  const published = mediaIsPublic(id);
  if (!published && !await validateSession(request.headers.get("cookie"))) return new Response(null, { status: 404 });
  const data = await readMedia(id);
  if (!data) return new Response(null, { status: 404 });
  // UUID filenames are immutable. Always check access before validating a cache.
  const etag = `"${id}"`;
  const cacheControl = published ? "public, max-age=0, must-revalidate" : "private, no-store";
  if (published && request.headers.get("if-none-match")?.split(",").some(value => value.trim().replace(/^W\//, "") === etag || value.trim() === "*")) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }
  return new Response(new Uint8Array(data), { headers: {
    "Content-Type": "image/webp", "Content-Length": String(data.length),
    "Cache-Control": cacheControl, ...(published ? { ETag: etag } : {}),
    "X-Content-Type-Options": "nosniff", "Content-Disposition": 'inline; filename="image.webp"',
  } });
};
