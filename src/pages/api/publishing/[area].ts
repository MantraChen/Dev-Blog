import { z } from "zod";
import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { HttpError } from "@/lib/http-error";
import {
  writingAssets,
  saveAsset,
  deleteAsset,
  listShares,
  createShare,
  revokeShare,
} from "@/db/publishing";
import { preflight } from "@/lib/preflight";
export const GET = adminEndpoint(({ params, url }) => {
  if (params.area === "assets") return Response.json(writingAssets());
  if (params.area === "shares") {
    const id = z.uuid().safeParse(url.searchParams.get("draftId"));
    if (!id.success) throw new HttpError(400, "Invalid draft ID.");
    return Response.json(listShares(id.data));
  }
  throw new HttpError(404, "Not found");
});
export const POST = adminEndpoint(async ({ params, request }) => {
  if (params.area === "assets") {
    const input = await body(
      request,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("save"),
          id: z.uuid().optional(),
          kind: z.enum(["template", "snippet"]),
          name: z.string().trim().min(1).max(100),
          content: z.string().max(50000),
        }),
        z.object({ action: z.literal("delete"), id: z.uuid() }),
      ]),
    );
    return Response.json(
      input.action === "save" ? saveAsset(input) : deleteAsset(input.id),
    );
  }
  if (params.area === "shares") {
    const input = await body(
      request,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create"),
          draftId: z.uuid(),
          version: z.number().int().positive(),
          hours: z.number().int().min(1).max(168),
        }),
        z.object({ action: z.literal("revoke"), id: z.uuid() }),
      ]),
    );
    return Response.json(
      input.action === "create"
        ? createShare(input.draftId, input.version, input.hours)
        : revokeShare(input.id),
    );
  }
  if (params.area === "preflight") {
    const input = await body(
      request,
      z.object({
        draftId: z.uuid(),
        version: z.number().int().positive(),
        external: z.boolean().default(false),
      }),
    );
    return Response.json(
      await preflight(input.draftId, input.version, input.external),
    );
  }
  throw new HttpError(404, "Not found");
});
