import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { draftVersionSchema, saveDraftSchema } from "@/lib/editor-data";
import { discardDraft, getDraft, saveDraft } from "@/db/editor";
export const GET = adminEndpoint(({ params }) => Response.json(getDraft(params.id!)));
export const PUT = adminEndpoint(async ({ request, params }) => {
  const input = await body(request, saveDraftSchema);
  return Response.json(saveDraft(params.id!, input.version, input.data));
});
export const DELETE = adminEndpoint(async ({ request, params }) => {
  const input = await body(request, draftVersionSchema);
  discardDraft(params.id!, input.version);
  return Response.json({ ok: true });
});
