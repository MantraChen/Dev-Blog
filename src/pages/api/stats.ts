import type { APIRoute } from "astro";
import { validateSession } from "@/lib/auth";
import { getTotalViews, getTopPosts, getViewsByDay } from "@/db/queries";

export const GET: APIRoute = async ({ request }) => {
  if (!(await validateSession(request.headers.get("cookie")))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [totalViews, topPosts, dailyViews] = await Promise.all([
    getTotalViews(),
    getTopPosts(10),
    getViewsByDay(30),
  ]);

  return new Response(
    JSON.stringify({ totalViews, topPosts, dailyViews }),
    { headers: { "Content-Type": "application/json" } },
  );
};
