import type { Draft, DraftStore } from "../../../../packages/core/src/model";
export type DraftSession = {
  namespace: string;
  principalKey: string;
  key: CryptoKey;
  keyVersion: number;
  isCurrent: () => boolean;
};
export type RecordData = {
  id: string;
  namespace: string;
  projectId: string;
  revision: number;
  keyVersion: number;
  iv: number[];
  ciphertext: number[];
};
const bytes = new TextEncoder();
function aad(
  r: Pick<
    RecordData,
    "id" | "namespace" | "projectId" | "revision" | "keyVersion"
  >,
) {
  return bytes.encode(
    JSON.stringify([
      "planner-draft-v1",
      r.namespace,
      r.projectId,
      r.id,
      r.revision,
      r.keyVersion,
    ]),
  );
}
export class BrowserDraftStore implements DraftStore {
  private selected = new Map<string, { id: string; revision: number }>();
  private pending: Promise<unknown> = Promise.resolve();
  private db: Promise<IDBDatabase>;
  constructor(private session: DraftSession) {
    this.db = new Promise((resolve, reject) => {
      const r = indexedDB.open("planner-protected-drafts", 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore("drafts", { keyPath: "id" });
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("Draft database blocked"));
      r.onsuccess = () => resolve(r.result);
    });
  }
  private check(principalKey = this.session.principalKey) {
    if (!this.session.isCurrent() || principalKey !== this.session.principalKey)
      throw new Error("Draft session unavailable");
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const p = this.pending.then(action);
    this.pending = p.catch(() => {});
    return p;
  }
  async records() {
    this.check();
    const db = await this.db;
    this.check();
    return new Promise<RecordData[]>((resolve, reject) => {
      const t = db.transaction("drafts", "readonly"),
        r = t.objectStore("drafts").getAll();
      t.oncomplete = () => {
        try {
          this.check();
          resolve(
            (r.result as RecordData[]).filter(
              (r) => r.namespace === this.session.namespace,
            ),
          );
        } catch (e) {
          reject(e);
        }
      };
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("Draft read aborted"));
    });
  }
  private async decrypt(r: RecordData) {
    if (r.keyVersion !== this.session.keyVersion)
      throw new Error("Draft key version unavailable");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(r.iv), additionalData: aad(r) },
      this.session.key,
      new Uint8Array(r.ciphertext),
    );
    this.check();
    const draft = JSON.parse(new TextDecoder().decode(plain)) as Draft;
    if (
      draft.principalKey !== this.session.principalKey ||
      draft.projectId !== r.projectId
    )
      throw new Error("Draft identity mismatch");
    return draft;
  }
  async load(principalKey: string) {
    this.check(principalKey);
    await this.pending;
    const records = await this.records();
    const result: Draft[] = [];
    for (const projectId of new Set(records.map((r) => r.projectId))) {
      const choice = this.selected.get(projectId);
      const r = choice
        ? records.find((r) => r.id === choice.id)
        : records
            .filter((r) => r.projectId === projectId)
            .sort((a, b) => b.revision - a.revision)[0];
      if (!r) continue;
      if (choice && r.revision !== choice.revision)
        throw new Error("Draft changed in another tab; reload recovery");
      const draft = await this.decrypt(r);
      this.selected.set(projectId, { id: r.id, revision: r.revision });
      result.push(draft);
    }
    return result;
  }
  async recoveries() {
    const result = [];
    for (const r of await this.records())
      result.push({ id: r.id, draft: await this.decrypt(r) });
    return result;
  }
  async select(id: string) {
    await this.pending;
    const r = (await this.records()).find((r) => r.id === id);
    if (!r) throw new Error("Draft missing");
    const draft = await this.decrypt(r);
    this.selected.set(r.projectId, { id: r.id, revision: r.revision });
    return draft;
  }
  save(draft: Draft) {
    return this.serialize(async () => {
      this.check(draft.principalKey);
      const old = this.selected.get(draft.projectId);
      const r: RecordData = {
        id: old?.id ?? crypto.randomUUID(),
        namespace: this.session.namespace,
        projectId: draft.projectId,
        revision: (old?.revision ?? 0) + 1,
        keyVersion: this.session.keyVersion,
        iv: Array.from(crypto.getRandomValues(new Uint8Array(12))),
        ciphertext: [],
      };
      r.ciphertext = Array.from(
        new Uint8Array(
          await crypto.subtle.encrypt(
            {
              name: "AES-GCM",
              iv: new Uint8Array(r.iv),
              additionalData: aad(r),
            },
            this.session.key,
            bytes.encode(JSON.stringify(draft)),
          ),
        ),
      );
      await this.change(r.id, old?.revision, (store) => store.put(r));
      this.check();
      this.selected.set(draft.projectId, { id: r.id, revision: r.revision });
    });
  }
  remove(principalKey: string, projectId: string) {
    return this.serialize(async () => {
      this.check(principalKey);
      const old = this.selected.get(projectId);
      if (!old) return;
      await this.change(old.id, old.revision, (store) => store.delete(old.id));
      this.selected.delete(projectId);
    });
  }
  private async change(
    id: string,
    revision: number | undefined,
    write: (store: IDBObjectStore) => void,
  ) {
    this.check();
    const db = await this.db;
    this.check();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("drafts", "readwrite"),
        store = t.objectStore("drafts"),
        get = store.get(id);
      let error: unknown;
      t.oncomplete = () => resolve();
      t.onerror = () => reject(error ?? t.error);
      t.onabort = () =>
        reject(error ?? t.error ?? new Error("Draft write aborted"));
      get.onsuccess = () => {
        try {
          this.check();
          const current = get.result as RecordData | undefined;
          if (
            current?.revision !== revision ||
            (current && current.namespace !== this.session.namespace)
          )
            throw new Error("Draft changed in another tab");
          write(store);
        } catch (e) {
          error = e;
          t.abort();
        }
      };
    });
  }
  async discardAll() {
    await this.pending;
    for (const r of await this.records()) {
      await this.change(r.id, r.revision, (store) => store.delete(r.id));
    }
    this.selected.clear();
  }
}
