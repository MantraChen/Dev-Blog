import type { APIContext, APIRoute } from "astro";
import { validateSession } from "./auth";
import { HttpError } from "./http-error";
import { safeParseBody } from "./validation";
import type { z } from "zod";

export function adminEndpoint(handler: (context: APIContext) => Promise<Response> | Response): APIRoute {
  return async context => {
    if (!await validateSession(context.request.headers.get("cookie"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
    try { return await handler(context); }
    catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  };
}

export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = await safeParseBody(request, schema);
  if (!parsed.success) throw new HttpError(parsed.status, parsed.error);
  return parsed.data;
}
