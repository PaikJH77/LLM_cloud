import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";
export type KeyRing = { active: string; keys: Record<string, string> };
export function validateKeyRing(ring: KeyRing) {
  if (!ring.keys[ring.active])
    throw new Error("Active draft master key missing");
  for (const key of Object.values(ring.keys))
    if (Buffer.from(key, "base64").length !== 32)
      throw new Error("Draft master keys must be 256 bits");
  return ring;
}
export function draftKeyService(db: Pool, environment: string, ring: KeyRing) {
  validateKeyRing(ring);
  if (!environment) throw new Error("Environment required");
  return async (ownerId: string) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,771))",
        [environment + ":" + ownerId],
      );
      const r = await client.query(
        "SELECT * FROM draft_keys WHERE owner_id=$1 AND environment=$2 FOR UPDATE",
        [ownerId, environment],
      );
      const row = r.rows[0],
        keyVersion = row?.key_version ?? 1;
      const aad = Buffer.from(
        JSON.stringify(["planner-draft-key", environment, ownerId, keyVersion]),
      );
      let key: Buffer;
      if (row) {
        const master = ring.keys[row.master_version];
        if (!master) throw new Error("Draft master key unavailable");
        const d = createDecipheriv(
          "aes-256-gcm",
          Buffer.from(master, "base64"),
          Buffer.from(row.iv, "base64"),
        );
        d.setAAD(aad);
        d.setAuthTag(Buffer.from(row.tag, "base64"));
        key = Buffer.concat([
          d.update(Buffer.from(row.ciphertext, "base64")),
          d.final(),
        ]);
      } else {
        key = randomBytes(32);
      }
      if (!row || row.master_version !== ring.active) {
        const iv = randomBytes(12),
          c = createCipheriv(
            "aes-256-gcm",
            Buffer.from(ring.keys[ring.active], "base64"),
            iv,
          );
        c.setAAD(aad);
        const encrypted = Buffer.concat([c.update(key), c.final()]);
        await client.query(
          "INSERT INTO draft_keys(owner_id,environment,key_version,master_version,iv,ciphertext,tag) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,environment) DO UPDATE SET master_version=EXCLUDED.master_version,iv=EXCLUDED.iv,ciphertext=EXCLUDED.ciphertext,tag=EXCLUDED.tag",
          [
            ownerId,
            environment,
            keyVersion,
            ring.active,
            iv.toString("base64"),
            encrypted.toString("base64"),
            c.getAuthTag().toString("base64"),
          ],
        );
      }
      await client.query("COMMIT");
      return { key: key.toString("base64"), keyVersion, environment };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  };
}
