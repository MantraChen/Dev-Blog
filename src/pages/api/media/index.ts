import { adminEndpoint } from "@/lib/admin-endpoint";
import { listMedia, uploadImage } from "@/lib/media";
import { RateLimiter } from "@/lib/rate-limit";
import { sqlite } from "@/db";
const uploads = new RateLimiter(sqlite, "media", 20, 60_000);
export const GET = adminEndpoint(({ url }) => Response.json(listMedia(url.searchParams.get("before") || undefined)));
export const POST = adminEndpoint(async ({ request }) => {
  const rate = uploads.check("admin");
  if (!rate.allowed) return Response.json({ error: "Too many uploads. Please retry shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  return Response.json(await uploadImage(request), { status: 201 });
});
