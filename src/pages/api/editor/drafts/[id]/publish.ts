import { adminEndpoint, body } from "@/lib/admin-endpoint";
import { draftVersionSchema } from "@/lib/editor-data";
import { publishDraft } from "@/db/editor";
export const POST = adminEndpoint(async ({ request, params }) => {
  const input = await body(request, draftVersionSchema);
  return Response.json(publishDraft(params.id!, input.version));
});
