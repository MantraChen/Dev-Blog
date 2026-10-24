// Astro replaces BASE_URL at build time in both server and client bundles.
export const BASE_PATH = (import.meta.env?.BASE_URL || "/").replace(/\/+$/, "");
export const COOKIE_PATH = `${BASE_PATH}/`;
export const SESSION_COOKIE = BASE_PATH ? "howielog_admin_session" : "admin_session";
export const VISITOR_COOKIE = BASE_PATH ? "howielog_visitor" : "blog_visitor";
export const THEME_STORAGE_KEY = BASE_PATH ? "howielog:theme" : "theme";

export function withBase(path: string, base = BASE_PATH): string {
  if (!base || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`) || path.startsWith(`${base}#`)) return path;
  return base + path;
}

export function withoutBase(path: string, base = BASE_PATH): string {
  if (base && path === base) return "/";
  return base && path.startsWith(`${base}/`) ? path.slice(base.length) : path;
}

// Keep legacy article links and local images working without changing stored content.
export function contentUrl(value: string, base = BASE_PATH): string {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && url.hostname === "howielog.com") {
      return withBase(url.pathname + url.search + url.hash, base);
    }
  } catch { /* Relative URLs are handled below. */ }
  return withBase(value, base);
}

// Match Giscus's original pathname mapping, excluding the deployment prefix.
export function discussionTerm(pathname: string, base = BASE_PATH): string {
  const path = withoutBase(pathname, base);
  return path.length < 2 ? "index" : path.substring(1).replace(/\.\w+$/, "");
}
