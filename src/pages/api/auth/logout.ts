import type { APIRoute } from "astro";
import { logout, clearSessionCookie } from "@/lib/auth";

export const POST: APIRoute = async ({ request }) => {
  await logout(request.headers.get("cookie"));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
};
