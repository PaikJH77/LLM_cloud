import { getWebPool } from "../../apps/web/src/server/pool";
import { decodeJwt } from "jose";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createWebServer } from "../../apps/web/src/server/app";
import { createAuthenticator } from "../../apps/api/src/auth";
import { ownerPolicy } from "../../apps/web/src/server/owner-policy";
import {
  draftKeyService,
  type KeyRing,
} from "../../apps/web/src/server/draft-keys";
import { runMigrations } from "../../scripts/migrations";
import { dbUrl } from "./fixtures";
import { issuer, waitOidc, testToken } from "./oidc";
await waitOidc();
const db = getWebPool(dbUrl, true);
await runMigrations(db);
const owner = decodeJwt(await testToken()).sub!;
const ring: KeyRing = process.env.TEST_KEY_RING
  ? JSON.parse(process.env.TEST_KEY_RING)
  : {
      active: "fixture",
      keys: { fixture: Buffer.alloc(32, 19).toString("base64") },
    };
const port = Number(process.env.TEST_WEB_PORT || 4319);
const app = await createWebServer({
  db,
  origin: `http://127.0.0.1:${port}`,
  staticRoot: resolve("dist/web"),
  publicConfig: { issuer, audience: "planner-api", clientId: "planner-web" },
  authenticate: await createAuthenticator({
    db,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
    authorize: ownerPolicy(issuer, owner),
  }),
  draftKey: draftKeyService(db, "isolated-web-test-v2", ring),
});
await app.listen({ port, host: "127.0.0.1" });
console.log("Isolated web test server ready");
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(
    signal,
    () =>
      void app
        .close()
        .then(() => db.end())
        .then(() => process.exit(0)),
  );
