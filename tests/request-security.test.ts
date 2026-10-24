import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/lib/rate-limit";
import { getClientIp, parseSessionCookie, isSameOriginMutation } from "../src/lib/request-security";

test("session cookies reject corrupt encodings and invalid IDs without throwing", () => {
  for (const value of ["%", "%E0%A4%A", "anything", "", "../db"]) assert.equal(parseSessionCookie(`admin_session=${value}`), null);
  const id = crypto.randomUUID();
  assert.equal(parseSessionCookie(`theme=dark; admin_session=${id}`), id);
});

test("rate limits remain bounded, reset after expiry and reject malformed addresses", () => {
  const limiter = new RateLimiter(2, 1000, 2);
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("a", 1).allowed, true);
  assert.equal(limiter.check("a", 2).allowed, false);
  assert.equal(limiter.check("b", 3).allowed, true);
  assert.equal(limiter.check("c", 4).allowed, false);
  assert.equal(limiter.check("c", 1001).allowed, true);
  assert.equal(getClientIp("127.0.0.1"), "127.0.0.1");
  assert.equal(getClientIp("attacker, 127.0.0.1"), "unknown");
});

test("state-changing cross-origin requests are rejected", () => {
  const req = (origin?: string, site?: string) => new Request("https://howielog.com/api/auth/logout", {
    method: "POST", headers: { ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) },
  });
  assert.equal(isSameOriginMutation(req("https://evil.example")), false);
  assert.equal(isSameOriginMutation(req("null")), false);
  assert.equal(isSameOriginMutation(req(undefined, "cross-site")), false);
  assert.equal(isSameOriginMutation(req("https://howielog.com")), true);
  assert.equal(isSameOriginMutation(req()), true);
});
