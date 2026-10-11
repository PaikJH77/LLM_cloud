import { it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { testToken } from "../support/oidc";
import { Pool } from "pg";
import { dbUrl } from "../support/fixtures";
async function start(port: number) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/support/web-real-server.ts"],
    {
      env: { ...process.env, TEST_WEB_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture startup timeout")),
      15000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Fixture exited"));
    });
    child.stdout!.on("data", (data) => {
      if (String(data).includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return child;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}
it("independent API processes preserve replay and conflict after process/DB restart", async () => {
  let first = await start(4321),
    second = await start(4322);
  const token = await testToken();
  const request = async (port: number, path: string, body?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        origin: `http://127.0.0.1:${port}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const c = {
      requestId: randomUUID(),
      projectId: randomUUID(),
      expectedVersion: 0,
      operation: {
        type: "createProject",
        fields: { name: "process-restart", deadline: null },
      },
    };
    const result = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(i % 2 ? 4321 : 4322, "/commands", c),
      ),
    );
    expect(result.every((r) => r.status === 200)).toBe(true);
    for (const r of result) expect(r.data).toEqual(result[0].data);
    await stop(first);
    first = await start(4321);
    expect((await request(4321, "/requests/" + c.requestId)).data).toEqual(
      result[0].data,
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "docker",
        ["compose", "-f", "infra/compose.test.yml", "restart", "postgres"],
        { stdio: "ignore" },
      );
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Fixture DB restart failed")),
      );
    });
    let recovered = false;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await request(4322, "/commands", c);
        if (r.status === 200) {
          expect(r.data).toEqual(result[0].data);
          recovered = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(recovered).toBe(true);
    expect(
      (
        await request(4321, "/commands", {
          ...c,
          operation: {
            type: "createProject",
            fields: { name: "reused", deadline: null },
          },
        })
      ).status,
    ).toBe(422);
    const large = await request(4321, "/commands", {
      ...c,
      padding: "x".repeat(1_048_576),
    });
    expect(large.status).toBe(413);
  } finally {
    await stop(first);
    await stop(second);
  }
}, 60000);
it("SQL timeout rolls back and pooled client is usable afterwards", async () => {
  const db = new Pool({
    connectionString: dbUrl,
    max: 1,
    statement_timeout: 50,
  });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await expect(client.query("SELECT pg_sleep(0.2)")).rejects.toThrow();
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  expect((await db.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  await db.end();
});
