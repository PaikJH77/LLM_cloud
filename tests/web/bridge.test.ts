import "fake-indexeddb/auto";
import { afterEach, it, expect, vi } from "vitest";
vi.mock("../../apps/web/src/client/auth", () => ({
  WebAuth: class {
    generation = 0;
    onLogout = () => {};
    getAccessToken() {
      return this.generation === 0 ? "fixture" : null;
    }
    async completeCallback() {}
    async login() {}
    async logout() {
      this.generation++;
      this.onLogout();
    }
  },
}));
import { createWebBridge } from "../../apps/web/src/client/bridge";
import { owner } from "../support/fixtures";
import { principalKey } from "../../packages/core/src/contracts";
import type { Draft } from "../../packages/core/src/model";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture() {
  vi.stubGlobal("location", { origin: "https://planner.test" });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/session")
            ? owner
            : {
                key: Buffer.alloc(32, 19).toString("base64"),
                keyVersion: 1,
                environment: crypto.randomUUID(),
              },
        ),
        { headers: { "content-type": "application/json" } },
      ),
  );
  return createWebBridge({
    issuer: "https://issuer.test",
    clientId: "web",
    audience: "api",
  });
}
const draft: Draft = {
  principalKey: principalKey(owner),
  projectId: "project",
  base: null,
  editedFields: { kind: "project", name: "preserve pending", deadline: "" },
  command: null,
  phase: "editing",
  savedLocallyAt: new Date().toISOString(),
};
it("keep logout waits for pending protected write before invalidating session", async () => {
  const bridge = await fixture(),
    store = bridge.recovery()!;
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r)),
    encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
    entered();
    await gate;
    return encrypt(...args);
  });
  const save = bridge.drafts.save(draft);
  await started;
  const keep = bridge.logout("keep");
  try {
    expect(
      await Promise.race([
        keep.then(() => "completed"),
        new Promise((r) => setTimeout(() => r("waiting"), 20)),
      ]),
    ).toBe("waiting");
  } finally {
    release();
    await save.catch(() => {});
    await keep.catch(() => {});
  }
  expect(await bridge.session()).toBeNull();
  // Read the database independently after invalidation; ciphertext must still exist.
  const rows = await new Promise<any[]>((resolve, reject) => {
    const open = indexedDB.open("planner-protected-drafts", 1);
    open.onsuccess = () => {
      const tx = open.result.transaction("drafts"),
        r = tx.objectStore("drafts").getAll();
      tx.oncomplete = () => {
        resolve(r.result);
        open.result.close();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  expect(rows.some((r) => r.projectId === "project")).toBe(true);
});
it("keep logout reports persistence failure and retains the session", async () => {
  const bridge = await fixture();
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
    throw new DOMException("Quota", "QuotaExceededError");
  });
  await expect(bridge.drafts.save(draft)).rejects.toThrow();
  await expect(bridge.logout("keep")).rejects.toThrow();
  expect(await bridge.session()).toEqual(owner);
});
