import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import bcrypt from "bcryptjs";
import { sqlite } from "../db";
import { HttpError } from "./http-error";
import { parseSessionCookie } from "./request-security";

type Key = {
  id: string;
  publicKey: Buffer;
  counter: number;
  transports: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};
export function relyingParty() {
  const url = new URL(
    process.env.WEBAUTHN_ORIGIN ||
      process.env.SITE_URL ||
      "https://howielog.com",
  );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new HttpError(503, "Passkeys require HTTPS or localhost.");
  return { origin: url.origin, rpID: url.hostname };
}
export async function requirePassword(password: string) {
  if (
    !process.env.ADMIN_PASSWORD_HASH ||
    !(await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH))
  )
    throw new HttpError(401, "Password verification failed.");
}
function challenge(value: string, purpose: string, sessionId: string | null) {
  sqlite
    .prepare("DELETE FROM auth_challenges WHERE expiresAt<?")
    .run(Date.now());
  // Public authentication options are bounded even if requests use many source IPs.
  if (
    (
      sqlite.prepare("SELECT count(*) n FROM auth_challenges").get() as {
        n: number;
      }
    ).n >= 500
  )
    throw new HttpError(429, "Too many pending sign-ins. Try again later.");
  const id = randomUUID();
  sqlite
    .prepare("INSERT INTO auth_challenges VALUES (?,?,?,?,?)")
    .run(id, value, purpose, sessionId, Date.now() + 300000);
  return id;
}
export function consumeChallenge(
  id: string,
  purpose: string,
  sessionId: string | null,
) {
  const row = sqlite
    .prepare(
      "DELETE FROM auth_challenges WHERE id=? AND purpose=? AND sessionId IS ? RETURNING challenge,expiresAt",
    )
    .get(id, purpose, sessionId) as
    { challenge: string; expiresAt: number } | undefined;
  if (!row || row.expiresAt <= Date.now())
    throw new HttpError(400, "Challenge expired or already used. Try again.");
  return row.challenge;
}
export async function registrationOptions(sessionId: string) {
  const { rpID } = relyingParty();
  const keys = sqlite.prepare("SELECT id FROM admin_passkeys").all() as {
    id: string;
  }[];
  if (keys.length >= 10) throw new HttpError(409, "Keep at most 10 passkeys.");
  sqlite
    .prepare("INSERT OR IGNORE INTO site_settings VALUES ('passkeyUserId',?)")
    .run(randomBytes(32).toString("base64url"));
  const user = (
    sqlite
      .prepare("SELECT value FROM site_settings WHERE key='passkeyUserId'")
      .get() as { value: string }
  ).value;
  const options = await generateRegistrationOptions({
    rpName: "HowieLog Admin",
    rpID,
    userName: "admin",
    userID: new Uint8Array(Buffer.from(user, "base64url")),
    excludeCredentials: keys,
    attestationType: "none",
    supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  return {
    options,
    challengeId: challenge(options.challenge, "register", sessionId),
  };
}
export async function registerPasskey(
  sessionId: string,
  id: string,
  name: string,
  response: RegistrationResponseJSON,
) {
  const expectedChallenge = consumeChallenge(id, "register", sessionId),
    { origin, rpID } = relyingParty();
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!result.verified) throw new Error("Not verified");
    const key = result.registrationInfo.credential;
    sqlite
      .transaction(() => {
        if (
          (
            sqlite.prepare("SELECT count(*) n FROM admin_passkeys").get() as {
              n: number;
            }
          ).n >= 10
        )
          throw new Error("Too many keys");
        sqlite
          .prepare("INSERT INTO admin_passkeys VALUES (?,?,?,?,?,?,NULL)")
          .run(
            key.id,
            Buffer.from(key.publicKey),
            key.counter,
            JSON.stringify(key.transports || []),
            name,
            new Date().toISOString(),
          );
        sqlite
          .prepare(
            "INSERT INTO audit_logs(action,resource) VALUES ('passkey.register','security')",
          )
          .run();
      })
      .immediate();
    return { ok: true };
  } catch {
    throw new HttpError(400, "Passkey registration failed. Start again.");
  }
}
export async function authenticationOptions() {
  const { rpID } = relyingParty();
  // Discoverable credentials: no account or credential inventory is disclosed.
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });
  return { options, challengeId: challenge(options.challenge, "login", null) };
}
export async function authenticatePasskey(
  id: string,
  response: AuthenticationResponseJSON,
  userAgent: string,
) {
  const expectedChallenge = consumeChallenge(id, "login", null),
    { origin, rpID } = relyingParty();
  const key = sqlite
    .prepare("SELECT * FROM admin_passkeys WHERE id=?")
    .get(response.id) as Key | undefined;
  if (!key) throw new HttpError(401, "Passkey sign-in failed.");
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: key.id,
        publicKey: new Uint8Array(key.publicKey),
        counter: key.counter,
      },
    });
    if (!result.verified) throw new Error("Not verified");
    return sqlite
      .transaction(() => {
        const changed = sqlite
          .prepare(
            "UPDATE admin_passkeys SET counter=?,lastUsedAt=? WHERE id=? AND counter=?",
          )
          .run(
            result.authenticationInfo.newCounter,
            new Date().toISOString(),
            key.id,
            key.counter,
          );
        if (!changed.changes) throw new Error("Credential changed");
        const session = randomUUID();
        sqlite
          .prepare(
            "INSERT INTO admin_sessions(id,expiresAt,userAgent,lastSeenAt,authMethod,verifiedAt) VALUES (?,?,?,?,?,?)",
          )
          .run(
            session,
            new Date(Date.now() + 7 * 86400000).toISOString(),
            userAgent.slice(0, 300),
            new Date().toISOString(),
            "passkey",
            Date.now(),
          );
        sqlite
          .prepare(
            "INSERT INTO audit_logs(action,resource) VALUES ('login.passkey','security')",
          )
          .run();
        return session;
      })
      .immediate();
  } catch {
    throw new HttpError(401, "Passkey sign-in failed.");
  }
}
const managementId = (id: string) =>
  createHash("sha256").update(id).digest("hex");
export function securityOverview(cookie: string | null) {
  const current = parseSessionCookie(cookie || "");
  return {
    rpID: relyingParty().rpID,
    origin: relyingParty().origin,
    passkeys: sqlite
      .prepare(
        "SELECT id,name,createdAt,lastUsedAt FROM admin_passkeys ORDER BY createdAt DESC",
      )
      .all(),
    sessions: (
      sqlite
        .prepare(
          "SELECT id,createdAt,expiresAt,userAgent,lastSeenAt,authMethod FROM admin_sessions WHERE expiresAt>? ORDER BY createdAt DESC LIMIT 100",
        )
        .all(new Date().toISOString()) as { id: string }[]
    ).map((row) => ({
      ...row,
      id: managementId(row.id),
      current: row.id === current,
    })),
  };
}
export function revokeSessions(cookie: string | null, id?: string) {
  const current = parseSessionCookie(cookie || "");
  const rows = sqlite
    .prepare("SELECT id FROM admin_sessions WHERE id!=?")
    .all(current) as { id: string }[];
  sqlite
    .transaction(() => {
      for (const row of rows)
        if (!id || managementId(row.id) === id)
          sqlite.prepare("DELETE FROM admin_sessions WHERE id=?").run(row.id);
    })
    .immediate();
  return { ok: true };
}
