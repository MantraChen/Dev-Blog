import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { safeParseBody } from "../src/lib/validation";

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
