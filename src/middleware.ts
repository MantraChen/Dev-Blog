import { defineMiddleware } from "astro:middleware";

// ─── Rate Limiting for Public Endpoints ─────────────────────────────
const PUBLIC_RATE_LIMIT = 60; // requests per window
const PUBLIC_RATE_WINDOW_MS = 60 * 1000; // 1 minute

const publicRateLimits = new Map<
  string,
  { count: number; windowStart: number }
>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of publicRateLimits) {
    if (now - value.windowStart > PUBLIC_RATE_WINDOW_MS * 2) {
      publicRateLimits.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkPublicRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  const record = publicRateLimits.get(ip);

  if (!record || now - record.windowStart > PUBLIC_RATE_WINDOW_MS) {
    publicRateLimits.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: PUBLIC_RATE_LIMIT - 1 };
  }

  if (record.count >= PUBLIC_RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: PUBLIC_RATE_LIMIT - record.count };
}

// Public API paths that need rate limiting
const RATE_LIMITED_PATHS = [
  "/api/posts/search",
  "/api/posts/views",
  "/api/reactions",
];

// Max request body size: 1MB
const MAX_BODY_SIZE = 1 * 1024 * 1024;

export const onRequest = defineMiddleware(async ({ request }, next) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // ─── Request Body Size Check ────────────────────────────────────
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── Rate Limiting for Public API Endpoints ─────────────────────
  if (RATE_LIMITED_PATHS.some((p) => path.startsWith(p))) {
    const ip = getIp(request);
    const result = checkPublicRateLimit(ip);

    if (!result.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      });
    }
  }

  const response = await next();

  // ─── Security Headers ──────────────────────────────────────────
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  // Only set HSTS if the request came over HTTPS (or via proxy)
  if (
    request.headers.get("x-forwarded-proto") === "https" ||
    url.protocol === "https:"
  ) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
});
