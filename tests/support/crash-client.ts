// Isolated process fixture. No test credentials or cipher are shipped in desktop builds.
import { createCipheriv, createDecipheriv } from "node:crypto";
import { ProtectedDraftStore } from "../../apps/desktop/src/main/draft-store";
import { ApiClient } from "../../apps/desktop/src/main/api-client";
import {
  createSyncController,
  browserClock,
} from "../../apps/desktop/src/renderer/sync/controller";
const key = Buffer.from(process.env.TEST_CIPHER_KEY!, "hex");
const cipher = {
  available: () => true,
  encrypt: (s: string) => {
    const iv = Buffer.from(crypto.getRandomValues(new Uint8Array(12))),
      c = createCipheriv("aes-256-gcm", key, iv);
    const bytes = Buffer.concat([c.update(s), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), bytes]);
  },
  decrypt: (b: Buffer) => {
    const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString();
  },
};
const api = new ApiClient(process.env.TEST_API!, () => process.env.TEST_TOKEN!),
  principal = await api.session(),
  store = new ProtectedDraftStore(process.env.TEST_DRAFT_ROOT!, cipher),
  c = createSyncController(api, store, browserClock, principal);
await c.open(process.env.TEST_PROJECT!);
await c.edit({ kind: "project", name: "crash-recovery draft", deadline: "" });
await store.flush();
process.send?.("draft-persisted");
