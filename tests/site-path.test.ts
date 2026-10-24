import test from "node:test";
import assert from "node:assert/strict";
import {
  withBase,
  withoutBase,
  withoutLegacyBase,
  contentUrl,
  discussionTerm,
} from "../src/lib/site-path";

test("deployment prefixes preserve queries, fragments and unrelated URLs", () => {
  for (const base of ["", "/howielog"]) {
    assert.equal(withBase("/", base), base + "/");
    assert.equal(
      withBase("/api/posts?q=中文#x", base),
      base + "/api/posts?q=中文#x",
    );
    assert.equal(withoutBase(base + "/blog/post", base), "/blog/post");
    for (const url of [
      "https://example.com/blog",
      "//cdn.example.com/a",
      "#title",
      "mailto:a@example.com",
    ]) {
      assert.equal(withBase(url, base), url);
    }
  }
  assert.equal(withBase("/howielog/blog", "/howielog"), "/howielog/blog");
  assert.equal(
    withBase("/howielog?tag=test", "/howielog"),
    "/howielog?tag=test",
  );
  assert.equal(
    withoutBase("/howielogger/api", "/howielog"),
    "/howielogger/api",
  );
});

test("old article URLs migrate without rewriting external destinations", () => {
  assert.equal(
    contentUrl("https://howielog.com/blog/hello?q=1#part", "/howielog"),
    "/howielog/blog/hello?q=1#part",
  );
  assert.equal(
    contentUrl("/icon-512.png", "/howielog"),
    "/howielog/icon-512.png",
  );
  assert.equal(
    contentUrl("https://example.com/icon.png", "/howielog"),
    "https://example.com/icon.png",
  );
  assert.equal(
    contentUrl("javascript:alert(1)", "/howielog"),
    "javascript:alert(1)",
  ); // Sanitizer still rejects this scheme.
});

test("Giscus continues looking up the original pathname discussion", () => {
  assert.equal(
    discussionTerm("/howielog/blog/hello", "/howielog"),
    discussionTerm("/blog/hello", ""),
  );
  assert.equal(
    discussionTerm("/howielog/blog/%E4%B8%AD%E6%96%87", "/howielog"),
    "blog/%E4%B8%AD%E6%96%87",
  );
  assert.equal(discussionTerm("/howielog/", "/howielog"), "index");
});

test("restoring the primary domain normalizes old shared-host links without changing unrelated destinations", () => {
  for (const base of ["", "/howielog"]) {
    for (const old of [
      "/howielog/blog/hello?q=1#part",
      "https://dyyjs.com/howielog/blog/hello?q=1#part",
      "//dyyjs.com/howielog/blog/hello?q=1#part",
      "https://howielog.com/howielog/blog/hello?q=1#part",
    ])
      assert.equal(contentUrl(old, base), `${base}/blog/hello?q=1#part`);
    assert.equal(
      contentUrl("/howielog/media/image.webp", base),
      `${base}/media/image.webp`,
    );
  }
  for (const other of [
    "https://dyyjs.com/blog/hello",
    "https://dyyjs.com/howielogger/blog/hello",
    "https://dyyjs.com.evil.example/howielog/blog/hello",
    "//cdn.example.com/howielog/image.png",
    "https://user:password@dyyjs.com/howielog/blog/hello",
    "https://dyyjs.com:8443/howielog/blog/hello",
  ])
    assert.equal(contentUrl(other, ""), other);
  assert.equal(withoutLegacyBase("/howielog?tag=x#part"), "/?tag=x#part");
  assert.equal(withoutLegacyBase("/howielog/"), "/");
  assert.equal(
    withoutLegacyBase("/howielogger/blog/hello"),
    "/howielogger/blog/hello",
  );
  assert.equal(withoutLegacyBase("/howielog//evil.example"), "/evil.example");
  assert.equal(withoutLegacyBase("/howielog/\\evil.example"), "/evil.example");
  assert.equal(
    contentUrl("https://howielog.com//evil.example", ""),
    "/evil.example",
  );
});
