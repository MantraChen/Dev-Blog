import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { restoreDraftSchema } from "@/lib/editor-data";
import { getDraft, getRevision, listRevisions, restoreRevision } from "@/db/editor";
import { parseId } from "@/lib/validation";
export const GET = adminEndpoint(({ params, url }) => {
  const draft = getDraft(params.id!);
  const revisionId = parseId(url.searchParams.get("revision") || undefined);
  return Response.json(draft.postId ? revisionId ? getRevision(draft.postId, revisionId) : listRevisions(draft.postId) : []);
});
export const POST = adminEndpoint(async ({ request, params }) => {
  const input = await body(request, restoreDraftSchema);
  return Response.json(restoreRevision(params.id!, input.version, input.revisionId));
});
