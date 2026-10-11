import { afterAll, beforeAll, it, expect } from "vitest";
import { runMigrations } from "../../scripts/migrations";
import { Pool } from "pg";
import { decodeJwt } from "jose";
import { dbUrl } from "../support/fixtures";
import { issuer, testToken, waitOidc } from "../support/oidc";
import { createAuthenticator } from "../../apps/api/src/auth";
import { ownerPolicy } from "../../apps/web/src/server/owner-policy";
import { createWebServer } from "../../apps/web/src/server/app";
import { resolve } from "node:path";
const db = new Pool({ connectionString: dbUrl });
beforeAll(async () => {
  await waitOidc();
  await runMigrations(db);
});
afterAll(() => db.end());
it("fails closed without owner configuration and checks issuer/sub before principal persistence", async () => {
  expect(() => ownerPolicy(issuer, "")).toThrow();
  const alice = await testToken(),
    bob = await testToken("bob");
  const authenticate = await createAuthenticator({
    db,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
    authorize: ownerPolicy(issuer, decodeJwt(alice).sub!),
  });
  expect((await authenticate(alice)).subject).toBe(decodeJwt(alice).sub);
  await expect(authenticate(bob)).rejects.toThrow("Owner");
  await expect(authenticate(alice.slice(0, -10) + "bad")).rejects.toThrow();
  const wrong = await createAuthenticator({
    db,
    issuer,
    audience: "not-api",
    allowLoopbackHttp: true,
  });
  await expect(wrong(alice)).rejects.toThrow();
});
it("rejects cookie-only, cross-origin and non-JSON mutation; never returns SPA for API", async () => {
  const token = await testToken();
  const app = await createWebServer({
    db,
    origin: "http://127.0.0.1:4319",
    staticRoot: resolve("dist/web"),
    publicConfig: { issuer, clientId: "planner-web", audience: "planner-api" },
    authenticate: await createAuthenticator({
      db,
      issuer,
      audience: "planner-api",
      allowLoopbackHttp: true,
      authorize: ownerPolicy(issuer, decodeJwt(token).sub!),
    }),
  });
  try {
    expect(
      (
        await app.inject({
          url: "/api/session",
          headers: { cookie: "_vercel_jwt=irrelevant" },
        })
      ).statusCode,
    ).toBe(401);
    for (const origin of [undefined, "https://evil.example"]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/commands",
            headers: {
              authorization: "Bearer " + token,
              ...(origin ? { origin } : {}),
            },
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
    }
    const r = await app.inject({
      url: "/api/session",
      headers: { authorization: "Bearer " + token },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toContain("no-store");
  } finally {
    await app.close();
  }
});
