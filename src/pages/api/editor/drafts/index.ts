import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { openDraftSchema } from "@/lib/editor-data";
import { listDrafts, openDraft } from "@/db/editor";
export const GET = adminEndpoint(() => Response.json(listDrafts()));
export const POST = adminEndpoint(async ({ request }) => {
  const input = await body(request, openDraftSchema);
  return Response.json(openDraft(input.id, input.postId));
});
