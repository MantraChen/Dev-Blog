import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { getTotalViews, getTopPosts, getViewsByDay } from "@/db/queries";

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
};

export const GET: APIRoute = async ({ request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: AUTH_HEADERS,
    });
  }

  const [totalViews, topPosts, dailyViews] = await Promise.all([
    getTotalViews(),
    getTopPosts(10),
    getViewsByDay(30),
  ]);

  return new Response(
    JSON.stringify({ totalViews, topPosts, dailyViews }),
    { headers: AUTH_HEADERS },
  );
};
