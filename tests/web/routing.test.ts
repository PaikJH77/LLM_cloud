import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebServer } from "../../apps/web/src/server/app";
import type { Pool } from "pg";
describe("same-origin web routing", () => {
  it("separates HTML, immutable assets, and authenticated JSON API", async () => {
    const root = await mkdtemp(join(tmpdir(), "planner-web-"));
    await mkdir(join(root, "assets"));
    await writeFile(
      join(root, "index.html"),
      "<!doctype html><h1>Planner</h1>",
    );
    await writeFile(join(root, "assets/app.abcdef.js"), "console.log(1)");
    const app = await createWebServer({
      staticRoot: root,
      origin: "http://127.0.0.1:4319",
      db: {} as Pool,
      authenticate: async () => ({ ownerId: "x", issuer: "i", subject: "s" }),
      publicConfig: {
        issuer: "https://example.com",
        clientId: "web",
        audience: "api",
      },
    });
    try {
      for (const url of ["/", "/auth/callback"]) {
        const r = await app.inject(url);
        expect(r.statusCode).toBe(200);
        expect(r.headers["cache-control"]).toContain("no-store");
      }
      expect(
        (await app.inject("/assets/app.abcdef.js")).headers["content-type"],
      ).toContain("javascript");
      expect((await app.inject("/assets/missing.js")).statusCode).toBe(404);
      expect((await app.inject("/api/session")).statusCode).toBe(401);
      const r = await app.inject({
        url: "/api/unknown",
        headers: { authorization: "Bearer test" },
      });
      expect(r.statusCode).toBe(404);
      expect(r.headers["content-type"]).toContain("json");
      expect(
        (await app.inject("/assets/%2e%2e/package.json")).statusCode,
      ).not.toBe(200);
    } finally {
      await app.close();
      await rm(root, { recursive: true });
    }
  });
});
