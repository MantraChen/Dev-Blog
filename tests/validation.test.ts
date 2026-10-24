import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { safeParseBody, parseId, createPostSchema, updatePostSchema, updateProjectSchema, updateFriendSchema, updateSkillSchema, updateTimelineSchema } from "../src/lib/validation";

test("IDs and dates are strict, tags are normalized and partial updates preserve omitted fields", () => {
  for (const value of ["1abc", "1.5", "01", "-1", "9007199254740992", undefined]) assert.equal(parseId(value), null);
  assert.equal(parseId("123"), 123);
  assert.equal(createPostSchema.safeParse({ title: "Test", slug: "test", publishedAt: "2026-02-30" }).success, false);
  const post = createPostSchema.parse({ title: "Test", slug: "test", publishedAt: "2026-10-25", tags: [" JavaScript ", "JavaScript"] });
  assert.deepEqual(post.tags, ["JavaScript"]);
  assert.equal(post.publishedAt, "2026-10-25T00:00:00.000Z");
  for (const schema of [updatePostSchema, updateProjectSchema, updateFriendSchema, updateSkillSchema, updateTimelineSchema]) {
    assert.deepEqual(schema.parse({}), {});
  }
});

test("body parsing rejects malformed JSON, unsupported types and oversized chunked bodies", async () => {
  const request = (body: BodyInit, type = "application/json") => new Request("http://localhost/api", {
    method: "POST", headers: { "Content-Type": type }, body, duplex: "half",
  } as RequestInit);
  const schema = z.object({ text: z.string() });
  assert.equal((await safeParseBody(request("{"), schema)).success, false);
  const plain = await safeParseBody(request('{"text":"value"}', "text/plain"), schema);
  assert.equal(!plain.success && plain.status, 415);
  const stream = new ReadableStream({ start(controller) {
    for (let i = 0; i < 17; i++) controller.enqueue(new Uint8Array(65536));
    controller.close();
  } });
  const large = await safeParseBody(request(stream), schema);
  assert.equal(!large.success && large.status, 413);
  assert.deepEqual(await safeParseBody(request('{"text":"你好"}'), schema), { success: true, data: { text: "你好" } });
});
