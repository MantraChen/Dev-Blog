import { adminEndpoint } from "@/lib/admin-endpoint";
import { importArticle, readUpload, withTransferSlot } from "@/lib/transfer";
import { HttpError } from "@/lib/http-error";
export const POST = adminEndpoint(async ({ request }) => {
  const type = request.headers.get("Content-Type")?.split(";")[0] || "";
  if (!["text/markdown", "application/zip"].includes(type))
    throw new HttpError(415, "Upload a Markdown or ZIP file");
  try {
    return await withTransferSlot(async () =>
      Response.json(await importArticle(await readUpload(request), type)),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "Import failed. Check file encoding, ZIP format and images.",
    );
  }
});
