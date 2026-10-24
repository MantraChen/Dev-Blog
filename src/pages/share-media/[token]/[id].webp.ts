import type { APIRoute } from "astro";
import { readShare, sharedMediaIds } from "@/db/publishing";
import { readMedia } from "@/lib/media";
export const GET: APIRoute = async ({ params }) => {
  const share = readShare(params.token!);
  if (!share || !sharedMediaIds(share.data).has(params.id!))
    return new Response(null, { status: 404 });
  const bytes = await readMedia(params.id!);
  return bytes
    ? new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
        },
      })
    : new Response(null, { status: 404 });
};
