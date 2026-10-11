import { it, expect } from "vitest";
import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { draftKeyService } from "../../apps/web/src/server/draft-keys";
import { runMigrations } from "../../scripts/migrations";
import { dbUrl } from "../support/fixtures";
it("wraps stable per-owner keys, rewraps on master rotation and fails closed on key loss", async () => {
  const db = new Pool({ connectionString: dbUrl });
  await runMigrations(db);
  const owner = randomUUID(),
    other = randomUUID();
  await db.query(
    "INSERT INTO principals(id,issuer,subject) VALUES($1::uuid,'key-test',$1::text),($2::uuid,'key-test',$2::text)",
    [owner, other],
  );
  const first = randomBytes(32).toString("base64"),
    second = randomBytes(32).toString("base64");
  try {
    const service = draftKeyService(db, "test", {
      active: "a",
      keys: { a: first },
    });
    const key = await service(owner);
    expect(await service(owner)).toEqual(key);
    expect((await service(other)).key).not.toBe(key.key);
    const stored = (
      await db.query("SELECT * FROM draft_keys WHERE owner_id=$1", [owner])
    ).rows[0];
    expect(JSON.stringify(stored)).not.toContain(key.key);
    const rotated = await draftKeyService(db, "test", {
      active: "b",
      keys: { a: first, b: second },
    })(owner);
    expect(rotated).toEqual(key);
    expect(
      await draftKeyService(db, "test", { active: "b", keys: { b: second } })(
        owner,
      ),
    ).toEqual(key);
    await expect(service(owner)).rejects.toThrow(/unavailable/);
  } finally {
    await db.query("DELETE FROM draft_keys WHERE owner_id=ANY($1)", [
      [owner, other],
    ]);
    await db.query("DELETE FROM principals WHERE id=ANY($1)", [[owner, other]]);
    await db.end();
  }
});
