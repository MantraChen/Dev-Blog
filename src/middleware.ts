import { defineMiddleware } from "astro:middleware";
import { RateLimiter } from "./lib/rate-limit";
import { getClientIp, isSameOriginMutation } from "./lib/request-security";

const publicLimits = new RateLimiter(60, 60_000);
const limitedPaths = new Set(["/api/posts/search", "/api/posts/views", "/api/reactions"]);
const jsonError = (error: string, status: number, headers = {}) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json", ...headers } });

export const onRequest = defineMiddleware(async ({ request, clientAddress }, next) => {
  const url = new URL(request.url);
  const path = url.pathname;
  let response: Response;
  if (Number(request.headers.get("content-length")) > 1024 * 1024) {
    response = jsonError("Request body too large", 413);
  } else if (path.startsWith("/api/") && !isSameOriginMutation(request)) {
    response = jsonError("Cross-origin requests are not allowed", 403);
  } else {
    const rate = limitedPaths.has(path) ? publicLimits.check(getClientIp(clientAddress)) : null;
    if (rate && !rate.allowed) {
      response = jsonError("Too many requests", 429, { "Retry-After": String(rate.retryAfterSeconds) });
    } else {
      try {
        response = await next();
      } catch (error) {
        if (!path.startsWith("/api/")) throw error;
        // Do not disclose SQL, content, credentials or stack traces in API responses.
        const failure = error as { code?: string; cause?: { code?: string } };
        const code = failure?.code ?? failure?.cause?.code;
        console.error("API request failed", path, code ?? "unknown");
        response = code === "SQLITE_CONSTRAINT_UNIQUE"
          ? jsonError("This value already exists. Choose a different slug.", 409)
          : jsonError("Request failed. Please try again.", 500);
      }
    }
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  // The adapter aborts oversized streams; never reuse that partially consumed connection.
  if (response.status === 413) response.headers.set("Connection", "close");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://giscus.app",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-src https://giscus.app",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "));
  if (path.startsWith("/admin") || path.startsWith("/api/") || response.status >= 400) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (path.startsWith("/admin")) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (url.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
});
