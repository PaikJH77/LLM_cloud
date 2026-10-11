import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { BrowserDraftStore } from "../../apps/web/src/client/draft-store";
import type { Draft } from "../../packages/core/src/model";
const draft: Draft = {
  principalKey: "account",
  projectId: "project",
  base: null,
  editedFields: { kind: "project", name: "very secret project", deadline: "" },
  command: null,
  phase: "editing",
  savedLocallyAt: new Date().toISOString(),
};
const session = async () => ({
  namespace: crypto.randomUUID(),
  principalKey: "account",
  key: await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  ),
  keyVersion: 1,
  isCurrent: () => true,
});
it("persists only encrypted records, recovers after reopening, and detects tamper", async () => {
  const s = await session(),
    a = new BrowserDraftStore(s);
  await a.save(draft);
  const records = await a.records();
  expect(JSON.stringify(records)).not.toContain("very secret");
  const b = new BrowserDraftStore(s);
  expect(await b.load("account")).toEqual([draft]);
  const wrong = new BrowserDraftStore({ ...s, key: (await session()).key });
  await expect(wrong.load("account")).rejects.toThrow();
  await expect(b.load("other")).rejects.toThrow();
});
it("CAS prevents stale tabs from deleting or replacing newer drafts", async () => {
  const s = await session(),
    a = new BrowserDraftStore(s);
  await a.save(draft);
  const b = new BrowserDraftStore(s);
  await b.load("account");
  await a.save({
    ...draft,
    editedFields: { kind: "project", name: "newer", deadline: "" },
  });
  await expect(b.remove("account", "project")).rejects.toThrow(/changed/);
  await expect(b.save(draft)).rejects.toThrow(/changed/);
  expect((await a.load("account"))[0].editedFields).toMatchObject({
    name: "newer",
  });
});
it("session invalidation refuses late persistence", async () => {
  const s = await session();
  let active = true;
  const a = new BrowserDraftStore({ ...s, isCurrent: () => active });
  await a.save(draft);
  active = false;
  await expect(a.save(draft)).rejects.toThrow();
  await expect(a.load("account")).rejects.toThrow();
});
it("quota failures cannot bypass protected-before-send on controller retry", async () => {
  const { createSyncController } =
    await import("../../apps/desktop/src/renderer/sync/controller");
  const { owner } = await import("../support/fixtures");
  const { principalKey } = await import("../../packages/core/src/contracts");
  const s = await session(),
    store = new BrowserDraftStore({ ...s, principalKey: principalKey(owner) });
  let sent = 0;
  const controller = createSyncController(
    {
      listProjects: async () => [],
      getProject: async () => {
        throw new Error("not created");
      },
      requestStatus: async () => null,
      mutate: async () => {
        sent++;
        throw new Error("must not send");
      },
    },
    store,
    { now: () => new Date(), setInterval: () => 0, clearInterval: () => {} },
    owner,
  );
  await controller.openNew(crypto.randomUUID());
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    throw new DOMException("Quota", "QuotaExceededError");
  };
  try {
    await controller.commit({
      type: "createProject",
      fields: { name: "protected", deadline: null },
    });
    expect(controller.state.status).toBe("failed");
    await controller.refresh();
    expect(sent).toBe(0);
  } finally {
    IDBObjectStore.prototype.put = original;
    controller.dispose();
  }
});
it("discard logout preserves other tabs' unsent drafts even after listing them", async () => {
  const s = await session(),
    a = new BrowserDraftStore(s),
    b = new BrowserDraftStore(s);
  await a.save({ ...draft, projectId: "tab-a" });
  await b.save({
    ...draft,
    projectId: "tab-b",
    editedFields: { kind: "project", name: "other tab unsent", deadline: "" },
  });
  await a.load("account");
  await a.discardOwned();
  const fresh = new BrowserDraftStore(s);
  expect((await fresh.load("account")).map((d) => d.projectId)).toEqual([
    "tab-b",
  ]);
});
it("rejects actual ciphertext, IV and revision-AAD tampering", async () => {
  for (const field of ["ciphertext", "iv", "revision"] as const) {
    const s = await session(),
      store = new BrowserDraftStore(s);
    await store.save(draft);
    const record = (await store.records())[0];
    if (field === "revision") record.revision++;
    else record[field][0] ^= 1;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("planner-protected-drafts", 1);
      open.onsuccess = () => {
        const tx = open.result.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put(record);
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(new BrowserDraftStore(s).load("account")).rejects.toThrow();
  }
});
