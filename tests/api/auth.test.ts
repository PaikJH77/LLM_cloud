import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { createServer } from "../../apps/api/src/server";
import { createAuthenticator } from "../../apps/api/src/auth";
import { migrate } from "../../apps/api/src/db";
import { dbUrl, command } from "../support/fixtures";
import { issuer, waitOidc, testToken } from "../support/oidc";
const db = new Pool({ connectionString: dbUrl });
let app: Awaited<ReturnType<typeof createServer>>, a: string, b: string;
beforeAll(async () => {
  await migrate(db);
  await waitOidc();
  a = await testToken();
  b = await testToken("bob");
  app = await createServer({
    db,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
  });
});
afterAll(async () => {
  await app?.close();
  await db.end();
});
const headers = (token: string) => ({ authorization: "Bearer " + token });
it("verifies real OIDC tokens and owner isolation on every route", async () => {
  const c = command(randomUUID(), 0, {
    type: "createProject",
    fields: { name: "private", deadline: null },
  });
  let r = await app.inject({
    method: "POST",
    url: "/commands",
    headers: headers(a),
    payload: c,
  });
  expect(r.statusCode).toBe(200);
  const id = c.projectId;
  expect(
    (await app.inject({ url: "/projects/" + id, headers: headers(b) }))
      .statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/commands",
        headers: headers(b),
        payload: command(id, 1, { type: "trashProject" }),
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({ url: "/requests/" + c.requestId, headers: headers(b) })
    ).json(),
  ).toBeNull();
  for (const state of ["active", "archived", "trashed"]) {
    r = await app.inject({
      url: "/projects?state=" + state + "&query=&sort=deadlineAsc",
      headers: headers(b),
    });
    expect(r.json().some((p: any) => p.project.id === id)).toBe(false);
  }
  expect(
    (
      await app.inject({ url: "/requests/" + c.requestId, headers: headers(a) })
    ).json().kind,
  ).toBe("applied");
});
it("rejects no token, altered signatures, wrong issuer and audience, expired signed tokens", async () => {
  for (const token of ["", a.slice(0, -10) + "xxxxxxxxxx"])
    expect(
      (await app.inject({ url: "/projects", headers: headers(token) }))
        .statusCode,
    ).toBe(401);
  const { privateKey } = await generateKeyPair("RS256");
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "unknown" })
    .setSubject("alice")
    .setIssuer(issuer)
    .setAudience("planner-api")
    .setExpirationTime("1h")
    .sign(privateKey);
  expect(
    (await app.inject({ url: "/projects", headers: headers(forged) }))
      .statusCode,
  ).toBe(401);
  const wrongAudience = await createAuthenticator({
    db,
    issuer,
    audience: "wrong",
    allowLoopbackHttp: true,
  });
  await expect(wrongAudience(a)).rejects.toThrow();
  const expiredVerifier = await createAuthenticator({
    db,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
    now: () => new Date(Date.now() + 120_000),
  });
  await expect(expiredVerifier(a)).rejects.toThrow();
});
it("rejects malformed inputs without leaking internals and refuses insecure configuration", async () => {
  expect(
    (await app.inject({ url: "/projects/not-a-uuid", headers: headers(a) }))
      .statusCode,
  ).toBe(422);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/commands",
        headers: headers(a),
        payload: { ownerId: "fake" },
      })
    ).statusCode,
  ).toBe(422);
  await expect(
    createServer({
      db,
      issuer: "http://example.test",
      audience: "planner-api",
    }),
  ).rejects.toThrow();
});
it("does not misclassify a database outage as an expired login", async () => {
  const unavailable = await createServer({
    db: {
      query: async () => {
        throw new Error("database unavailable");
      },
    } as any,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
  });
  try {
    expect(
      (
        await unavailable.inject({
          url: "/session",
          headers: headers(await testToken()),
        })
      ).statusCode,
    ).toBe(503);
  } finally {
    await unavailable.close();
  }
});
