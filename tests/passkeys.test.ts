import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  randomBytes,
  createHash,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { migrate } from "../scripts/migrate.mjs";
process.env.DATABASE_PATH = ":memory:";
process.env.WEBAUTHN_ORIGIN = "https://blog.example.com";
const { sqlite } = await import("../src/db");
migrate(sqlite);
const auth = await import("../src/lib/passkeys");
const session = crypto.randomUUID();
sqlite
  .prepare("INSERT INTO admin_sessions(id,expiresAt) VALUES (?,?)")
  .run(session, new Date(Date.now() + 86400000).toISOString());
const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  }),
  jwk = publicKey.export({ format: "jwk" }),
  credentialId = randomBytes(32),
  id = credentialId.toString("base64url");
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest();
const key = isoCBOR.encode(
  new Map([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
    [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
  ] as [number, number | Uint8Array][]),
);
function assertion(
  challenge: string,
  counter: number,
  origin = "https://blog.example.com",
  flags = 5,
) {
  const client = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
  const count = Buffer.alloc(4);
  count.writeUInt32BE(counter);
  const data = Buffer.concat([
    hash("blog.example.com"),
    Buffer.from([flags]),
    count,
  ]);
  return {
    id,
    rawId: id,
    type: "public-key" as const,
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString("base64url"),
      authenticatorData: data.toString("base64url"),
      signature: sign(
        "sha256",
        Buffer.concat([data, hash(client)]),
        privateKey,
      ).toString("base64url"),
    },
  };
}
test("WebAuthn registration and signed authentication require origin, UV, one-time challenges and monotonic counters", async () => {
  const registration = await auth.registrationOptions(session);
  const client = Buffer.from(
    JSON.stringify({
      type: "webauthn.create",
      challenge: registration.options.challenge,
      origin: "https://blog.example.com",
      crossOrigin: false,
    }),
  );
  const length = Buffer.alloc(2);
  length.writeUInt16BE(credentialId.length);
  const authData = Buffer.concat([
    hash("blog.example.com"),
    Buffer.from([0x45]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    length,
    credentialId,
    Buffer.from(key),
  ]);
  const attestation = isoCBOR.encode(
    new Map<string, string | Map<string, never> | Uint8Array>([
      ["fmt", "none"],
      ["attStmt", new Map<string, never>()],
      ["authData", new Uint8Array(authData)],
    ]),
  );
  await auth.registerPasskey(
    session,
    registration.challengeId,
    "Test authenticator",
    {
      id,
      rawId: id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: client.toString("base64url"),
        attestationObject: Buffer.from(attestation).toString("base64url"),
        transports: ["internal"],
      },
    },
  );
  const options = await auth.authenticationOptions();
  const newSession = await auth.authenticatePasskey(
    options.challengeId,
    assertion(options.options.challenge, 1),
    "Test device",
  );
  assert.ok(
    sqlite.prepare("SELECT 1 FROM admin_sessions WHERE id=?").get(newSession),
  );
  await assert.rejects(
    auth.authenticatePasskey(
      options.challengeId,
      assertion(options.options.challenge, 2),
      "Replay",
    ),
    /already used/,
  );
  for (const [origin, flags, counter] of [
    ["https://evil.example", 5, 2],
    ["https://blog.example.com", 1, 2],
    ["https://blog.example.com", 5, 1],
  ] as const) {
    const challenge = await auth.authenticationOptions();
    await assert.rejects(
      auth.authenticatePasskey(
        challenge.challengeId,
        assertion(challenge.options.challenge, counter, origin, flags),
        "Bad assertion",
      ),
      /failed/,
    );
  }
  const overview = auth.securityOverview("admin_session=" + session);
  assert.ok(!JSON.stringify(overview).includes(newSession));
  assert.ok(!JSON.stringify(overview).includes(session));
  auth.revokeSessions("admin_session=" + session);
  assert.equal(
    sqlite.prepare("SELECT 1 FROM admin_sessions WHERE id=?").get(newSession),
    undefined,
  );
  assert.ok(
    sqlite.prepare("SELECT 1 FROM admin_sessions WHERE id=?").get(session),
  );
});
test("registration challenges are bound to the authenticated session and expire", async () => {
  const options = await auth.registrationOptions(session);
  assert.throws(
    () =>
      auth.consumeChallenge(options.challengeId, "register", "other-session"),
    /expired/,
  );
  sqlite
    .prepare("UPDATE auth_challenges SET expiresAt=0 WHERE id=?")
    .run(options.challengeId);
  assert.throws(
    () => auth.consumeChallenge(options.challengeId, "register", session),
    /expired/,
  );
});
