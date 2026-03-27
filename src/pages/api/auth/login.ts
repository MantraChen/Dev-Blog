import type { APIRoute } from "astro";
import { login, makeSessionCookie } from "@/lib/auth";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const password = body?.password;

  if (!password || typeof password !== "string") {
    return new Response(JSON.stringify({ error: "Password required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = await login(password);

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Invalid password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": makeSessionCookie(sessionId),
    },
  });
};
