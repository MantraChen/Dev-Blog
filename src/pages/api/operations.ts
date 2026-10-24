import { z } from "zod";
import { adminEndpoint, body } from "@/lib/admin-endpoint";
import {
  healthReport,
  configureOperations,
  startOperation,
} from "@/lib/operations";
export const GET = adminEndpoint(async () =>
  Response.json(await healthReport()),
);
export const POST = adminEndpoint(async ({ request }) => {
  const input = await body(
    request,
    z.discriminatedUnion("action", [
      z.object({
        action: z.literal("configure"),
        remoteDaily: z.boolean(),
        retention: z.boolean(),
        localKeep: z.number().int().min(3).max(365),
      }),
      z.object({
        action: z.enum(["backup", "check", "retention-preview", "retention"]),
      }),
    ]),
  );
  return Response.json(
    input.action === "configure"
      ? configureOperations(input)
      : startOperation(input.action),
    { status: input.action === "configure" ? 200 : 202 },
  );
});
