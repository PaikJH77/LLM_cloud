import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { createServer } from "../../apps/api/src/server";
import { migrate } from "../../apps/api/src/db";
import { ApiClient } from "../../apps/desktop/src/main/api-client";
import { ProtectedDraftStore } from "../../apps/desktop/src/main/draft-store";
import { browserLogin } from "../../apps/desktop/src/main/auth";
import {
  createSyncController,
  browserClock,
} from "../../apps/desktop/src/renderer/sync/controller";
import { principalKey } from "../../packages/core/src/contracts";
import { dbUrl, command, applied } from "../support/fixtures";
import { issuer, testToken, waitOidc } from "../support/oidc";
import { faultProxy } from "../support/fault-proxy";
let db: Pool,
  app: Awaited<ReturnType<typeof createServer>>,
  base: string,
  proxy: Awaited<ReturnType<typeof faultProxy>>,
  root: string;
const key = randomBytes(32);
const cipher = {
  available: () => true,
  encrypt: (s: string) => {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([c.update(s), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), data]);
  },
  decrypt: (b: Buffer) => {
    const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString();
  },
};
test.beforeAll(async () => {
  await waitOidc();
  db = new Pool({ connectionString: dbUrl });
  await migrate(db);
  app = await createServer({
    db,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
  });
  base = await app.listen({ host: "127.0.0.1", port: 0 });
  proxy = await faultProxy(base);
  root = await mkdtemp(join(tmpdir(), "planner-e2e-"));
});
test.afterAll(async () => {
  await proxy?.close();
  await app?.close();
  await db?.end();
  if (root) await rm(root, { recursive: true, force: true });
});
async function client(name = "alice") {
  const token = await testToken(name),
    api = new ApiClient(proxy.url, () => token);
  return { api, principal: await api.session() };
}
async function attach(page: Page, api: ApiClient, store: ProtectedDraftStore) {
  const principal = await api.session(),
    key = principalKey(principal);
  await page.exposeFunction(
    "realPlannerCall",
    async (method: string, arg: any) => {
      switch (method) {
        case "session":
        case "login":
          return api.session();
        case "protection":
          return store.available();
        case "listProjects":
          return api.listProjects(arg);
        case "getProject":
          return api.getProject(arg);
        case "mutate":
          return api.mutate(arg);
        case "requestStatus":
          return api.requestStatus(arg);
        case "saveDraft":
          return store.save(arg);
        case "loadDrafts":
          return store.load(key);
        case "removeDraft":
          return store.remove(key, arg);
        case "logout":
          return;
      }
    },
  );
  await page.addInitScript(() => {
    const call = (m: string, a?: unknown) =>
      (window as any).realPlannerCall(m, a);
    (window as any).planner = {
      session: () => call("session"),
      login: () => call("login"),
      logout: (v: any) => call("logout", v),
      protection: () => call("protection"),
      listProjects: (v: any) => call("listProjects", v),
      getProject: (v: any) => call("getProject", v),
      mutate: (v: any) => call("mutate", v),
      requestStatus: (v: any) => call("requestStatus", v),
      drafts: {
        save: (v: any) => call("saveDraft", v),
        load: () => call("loadDrafts"),
        remove: (_: any, v: any) => call("removeDraft", v),
      },
    };
  });
}
test("real browser OIDC authorization code + PKCE login verifies state and nonce", async ({
  page,
}) => {
  const token = await browserLogin(
    { issuer, clientId: "planner-desktop", allowLoopbackHttp: true },
    async (url) => {
      await page.goto(url);
      await page.locator("#username").fill("alice");
      await page.locator("#password").fill("test-only-alice");
      await page.locator("#kc-login").click();
    },
  );
  const api = new ApiClient(base, () => token);
  expect((await api.session()).issuer).toBe(issuer);
});
test("two independent real service UI clients see committed changes; third owner cannot read", async ({
  browser,
}) => {
  const a = await client(),
    b = await client(),
    other = await client("bob");
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    pa = await ca.newPage(),
    pb = await cb.newPage();
  try {
    await attach(
      pa,
      a.api,
      new ProtectedDraftStore(join(root, "ui-a"), cipher),
    );
    await attach(
      pb,
      b.api,
      new ProtectedDraftStore(join(root, "ui-b"), cipher),
    );
    await Promise.all([pa.goto("/"), pb.goto("/")]);
    const name = "실제 동기화 " + randomUUID().slice(0, 8);
    await pa.getByRole("button", { name: "새 프로젝트", exact: true }).click();
    await pa.getByLabel("프로젝트 이름", { exact: true }).fill(name);
    await pa.getByRole("button", { name: "프로젝트 만들기" }).click();
    await expect(pa.getByRole("heading", { name, exact: true })).toBeVisible();
    await pb.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      pb.getByRole("button", { name: new RegExp(name) }),
    ).toBeVisible();
    const list = await a.api.listProjects({
      state: "active",
      query: name,
      sort: "updatedDesc",
    });
    expect(list).toHaveLength(1);
    await expect(other.api.getProject(list[0].project.id)).rejects.toThrow(
      "NOT_FOUND",
    );
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("real API conflict, lost response, protected restart recovery and API restart", async () => {
  const a = await client(),
    b = await client(),
    id = randomUUID();
  applied(
    await a.api.mutate(
      command(id, 0, {
        type: "createProject",
        fields: { name: "base", deadline: null },
      }),
    ),
  );
  const sa = new ProtectedDraftStore(join(root, "a"), cipher),
    sb = new ProtectedDraftStore(join(root, "b"), cipher),
    one = createSyncController(a.api, sa, browserClock, a.principal),
    two = createSyncController(b.api, sb, browserClock, b.principal);
  await Promise.all([one.open(id), two.open(id)]);
  await Promise.all([
    one.commit({
      type: "updateProject",
      fields: { name: "A", deadline: null },
    }),
    two.commit({
      type: "updateProject",
      fields: { name: "B", deadline: null },
    }),
  ]);
  expect([one.state.status, two.state.status].sort()).toEqual([
    "conflict",
    "saved",
  ]);
  const loser = one.state.status === "conflict" ? one : two;
  await loser.resolveConflict("latest");
  await one.refresh();
  proxy.setFault("after");
  await one.commit({
    type: "updateProject",
    fields: { name: "response lost", deadline: null },
  });
  expect(one.state.status).toBe("offline");
  const version = (await a.api.getProject(id)).project.version;
  one.dispose();
  const recovered = createSyncController(
    a.api,
    new ProtectedDraftStore(join(root, "a"), cipher),
    browserClock,
    a.principal,
  );
  await recovered.open(id);
  expect(recovered.state.status).toBe("saved");
  expect(recovered.state.snapshot?.project.version).toBe(version);
  expect(await sa.load(principalKey(a.principal))).toEqual([]);
  two.dispose();
  recovered.dispose();
  const port = new URL(base).port;
  await app.close();
  app = await createServer({
    db,
    issuer,
    audience: "planner-api",
    allowLoopbackHttp: true,
  });
  await app.listen({ host: "127.0.0.1", port: Number(port) });
  expect((await a.api.getProject(id)).project.name).toBe("response lost");
});
test("real unprocessed network failure retries once and remote archive prevents stale reapply", async () => {
  const a = await client(),
    b = await client(),
    id = randomUUID();
  applied(
    await a.api.mutate(
      command(id, 0, {
        type: "createProject",
        fields: { name: "before-fault", deadline: null },
      }),
    ),
  );
  const store = new ProtectedDraftStore(join(root, "before"), cipher),
    c = createSyncController(a.api, store, browserClock, a.principal);
  try {
    await c.open(id);
    proxy.setFault("before");
    await c.commit({
      type: "updateProject",
      fields: { name: "retry-success", deadline: null },
    });
    expect(c.state.status).toBe("offline");
    const request = c.state.draft!.command!;
    expect(await a.api.requestStatus(request.requestId)).toBeNull();
    await c.refresh();
    expect(c.state.status).toBe("saved");
    expect((await a.api.getProject(id)).project.version).toBe(2);
    await c.edit({ kind: "project", name: "stale edit", deadline: "" });
    applied(await b.api.mutate(command(id, 2, { type: "archiveProject" })));
    await c.commit({
      type: "updateProject",
      fields: { name: "stale edit", deadline: null },
    });
    expect(c.state.status).toBe("conflict");
    await c.resolveConflict("reapply");
    expect(c.state.status).toBe("conflict");
    expect((await a.api.getProject(id)).project.name).toBe("retry-success");
  } finally {
    c.dispose();
  }
});
test("protected draft survives forced client-process termination and requires same authenticated account", async () => {
  const { fork } = await import("node:child_process");
  const { once } = (await import("node:events")).default;
  const a = await client(),
    id = randomUUID();
  applied(
    await a.api.mutate(
      command(id, 0, {
        type: "createProject",
        fields: { name: "crash base", deadline: null },
      }),
    ),
  );
  const directory = join(root, "crashed"),
    token = await testToken();
  const child = fork("tests/support/crash-client.ts", [], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    env: {
      ...process.env,
      TEST_CIPHER_KEY: key.toString("hex"),
      TEST_API: base,
      TEST_TOKEN: token,
      TEST_PROJECT: id,
      TEST_DRAFT_ROOT: directory,
    },
  });
  try {
    await Promise.race([
      once(child, "message"),
      once(child, "exit").then(() => {
        throw new Error("Crash fixture exited before persistence");
      }),
    ]);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    const store = new ProtectedDraftStore(directory, cipher),
      restarted = createSyncController(a.api, store, browserClock, a.principal);
    try {
      await restarted.open(id);
      expect(restarted.state.draft?.editedFields).toMatchObject({
        name: "crash-recovery draft",
      });
      expect(restarted.state.status).toBe("editing");
      const b = await client("bob");
      expect(await store.load(principalKey(b.principal))).toEqual([]);
      expect((await a.api.getProject(id)).project.name).toBe("crash base");
    } finally {
      restarted.dispose();
    }
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
