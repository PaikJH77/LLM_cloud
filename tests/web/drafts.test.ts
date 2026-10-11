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
