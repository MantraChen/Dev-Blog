import { adminEndpoint } from "@/lib/admin-endpoint";
import { exportArticle, withTransferSlot } from "@/lib/transfer";
import { parseId } from "@/lib/validation";
import { HttpError } from "@/lib/http-error";
export const GET = adminEndpoint(async ({ params }) => {
  const id = parseId(params.id);
  if (!id) throw new HttpError(400, "Invalid article ID");
  return withTransferSlot(
    async () =>
      new Response(new Uint8Array(await exportArticle(id)), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="article-${id}.zip"`,
        },
      }),
  );
});
