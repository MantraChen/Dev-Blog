import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";

export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function externalUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(
      url.hostname,
    )
  )
    throw new Error("Blocked URL");
  url.hash = "";
  return url;
}
export interface LinkResult {
  url: string;
  status: "ok" | "broken" | "blocked" | "unverified";
  code?: number;
}
const cache = new Map<string, { at: number; result: LinkResult }>();
let checking = false;
async function probe(
  raw: string,
  redirects = 0,
  method: "HEAD" | "GET" = "HEAD",
  deadline = Date.now() + 30_000,
): Promise<Omit<LinkResult, "url">> {
  if (Date.now() >= deadline) return { status: "unverified" };
  let url: URL, addresses: Awaited<ReturnType<typeof lookup>>[];
  try {
    url = externalUrl(raw);
  } catch {
    return { status: "blocked" };
  }
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("DNS timeout")),
          Math.min(3000, Math.max(1, deadline - Date.now())),
        );
        timer.unref();
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      return { status: "blocked" };
  } catch {
    return { status: "unverified" };
  }
  const address = addresses[0];
  const result = await new Promise<{ code: number; location?: string }>(
    (resolve, reject) => {
      // Pin the validated address for this connection. Redirects repeat DNS validation.
      const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method,
          agent: false,
          headers: { "User-Agent": "DevBlog-LinkCheck/1.0" },
          lookup: (_hostname, options, callback) =>
            options.all
              ? callback(null, [address])
              : callback(null, address.address, address.family),
        },
        (res) => {
          resolve({
            code: res.statusCode || 0,
            location: res.headers.location,
          });
          res.destroy();
        },
      );
      req.setTimeout(4000, () => req.destroy(new Error("Request timed out")));
      const total = setTimeout(
        () => req.destroy(new Error("Request deadline")),
        Math.min(5000, Math.max(1, deadline - Date.now())),
      );
      total.unref();
      req.on("close", () => clearTimeout(total));
      req.on("error", reject);
      req.end();
    },
  ).catch(() => ({ code: 0, location: undefined }));
  if (result.code >= 300 && result.code < 400 && result.location) {
    if (redirects >= 3) return { status: "unverified", code: result.code };
    try {
      return probe(
        new URL(result.location, url).href,
        redirects + 1,
        method,
        deadline,
      );
    } catch {
      return { status: "blocked" };
    }
  }
  if ([405, 501].includes(result.code) && method === "HEAD")
    return probe(url.href, redirects, "GET", deadline);
  return {
    status:
      result.code >= 200 && result.code < 300
        ? "ok"
        : [404, 410].includes(result.code)
          ? "broken"
          : "unverified",
    ...(result.code ? { code: result.code } : {}),
  };
}
export async function checkExternalLinks(
  urls: string[],
): Promise<LinkResult[]> {
  if (checking) throw new Error("A link check is already running.");
  checking = true;
  try {
    const results: LinkResult[] = [];
    const deadline = Date.now() + 30_000;
    for (let i = 0; i < Math.min(urls.length, 20); i += 2) {
      results.push(
        ...(await Promise.all(
          urls.slice(i, i + 2).map(async (url) => {
            const old = cache.get(url);
            if (old && Date.now() - old.at < 3600000) return old.result;
            const result = { url, ...(await probe(url, 0, "HEAD", deadline)) };
            if (cache.size >= 200) cache.delete(cache.keys().next().value!);
            if (result.status !== "unverified")
              cache.set(url, { at: Date.now(), result });
            return result;
          }),
        )),
      );
    }
    return results;
  } finally {
    checking = false;
  }
}
