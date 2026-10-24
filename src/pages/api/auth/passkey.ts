import type { APIRoute } from "astro";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";
import {
  authenticationOptions,
  authenticatePasskey,
  registrationOptions,
  registerPasskey,
  requirePassword,
  securityOverview,
  revokeSessions,
} from "@/lib/passkeys";
import { adminEndpoint, body } from "@/lib/admin-endpoint";
import {
  validateSession,
  checkRateLimit,
  clearRateLimit,
  getClientIp,
  makeSessionCookie,
} from "@/lib/auth";
import { parseSessionCookie } from "@/lib/request-security";
import { HttpError } from "@/lib/http-error";
import { sqlite } from "@/db";
const responseSchema = z.looseObject({
  id: z.string().min(1).max(2048),
  rawId: z.string().max(2048),
  type: z.literal("public-key"),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()),
});
export const GET = adminEndpoint(({ request }) =>
  Response.json(securityOverview(request.headers.get("cookie"))),
);
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await body(
    request,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("login-options") }),
      z.object({
        action: z.literal("login-verify"),
        challengeId: z.uuid(),
        response: responseSchema,
      }),
      z.object({
        action: z.literal("register-options"),
        password: z.string().min(1).max(1024),
      }),
      z.object({
        action: z.literal("register-verify"),
        challengeId: z.uuid(),
        name: z.string().trim().min(1).max(100),
        response: responseSchema,
      }),
      z.object({
        action: z.literal("delete-key"),
        id: z.string().max(2048),
        password: z.string().min(1).max(1024),
      }),
      z.object({
        action: z.literal("revoke-sessions"),
        id: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      }),
    ]),
  );
  const cookie = request.headers.get("cookie"),
    ip = getClientIp(clientAddress);
  if (
    input.action === "login-options" ||
    input.action === "login-verify" ||
    input.action === "register-options" ||
    input.action === "delete-key"
  ) {
    const rate = checkRateLimit(ip);
    if (!rate.allowed)
      throw new HttpError(
        429,
        `Too many attempts. Try again in ${rate.retryAfterSeconds}s.`,
      );
  }
  if (input.action === "login-options")
    return Response.json(await authenticationOptions());
  if (input.action === "login-verify") {
    const session = await authenticatePasskey(
      input.challengeId,
      input.response as unknown as AuthenticationResponseJSON,
      request.headers.get("user-agent") || "Unknown device",
    );
    clearRateLimit(ip);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": makeSessionCookie(session) } },
    );
  }
  if (!(await validateSession(cookie)))
    throw new HttpError(401, "Unauthorized");
  if (input.action === "register-options") {
    await requirePassword(input.password);
    return Response.json(
      await registrationOptions(parseSessionCookie(cookie!)!),
    );
  }
  if (input.action === "register-verify")
    return Response.json(
      await registerPasskey(
        parseSessionCookie(cookie!)!,
        input.challengeId,
        input.name,
        input.response as unknown as RegistrationResponseJSON,
      ),
    );
  if (input.action === "delete-key") {
    await requirePassword(input.password);
    sqlite.prepare("DELETE FROM admin_passkeys WHERE id=?").run(input.id);
    return Response.json({ ok: true });
  }
  return Response.json(revokeSessions(cookie, input.id));
};
