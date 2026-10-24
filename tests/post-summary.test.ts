import { test } from "node:test";
import assert from "node:assert/strict";
import { toPostSummary } from "../src/lib/post-summary";
import type { PostItem } from "../src/db/types";

test("public list and search summaries retain covers and reading time but exclude full content", () => {
  const post: PostItem = { id: 1, slug: "test", title: "Test", description: "Summary", content: "word ".repeat(500),
    tags: ["test"], coverImage: "https://example.com/cover.png", publishedAt: "2026-10-25", updatedAt: null,
    draft: false, hidden: false, featured: false, series: null };
  const result = toPostSummary(post);
  assert.equal(result.readingTime, 2);
  assert.equal(result.coverImage, post.coverImage);
  assert.equal(result.slug, post.slug);
  assert.equal("content" in result, false);
});
