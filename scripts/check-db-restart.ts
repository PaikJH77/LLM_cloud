import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { applyCommand } from "../apps/api/src/projects/mutate";
import { owner, command, dbUrl, applied } from "../tests/support/fixtures";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const c = command(randomUUID(), 0, {
  type: "createProject",
  fields: { name: "restart fixture", deadline: null },
});
let db = new Pool({ connectionString: dbUrl });
const before = await applyCommand(db, owner, c);
await db.end();
const r = spawnSync(
  "docker",
  ["compose", "-f", "infra/compose.test.yml", "restart", "postgres"],
  { stdio: "inherit" },
);
assert.equal(r.status, 0);
for (let i = 0; i < 40; i++) {
  db = new Pool({ connectionString: dbUrl });
  try {
    await db.query("SELECT 1");
    break;
  } catch {
    await db.end();
    await new Promise((r) => setTimeout(r, 250));
  }
}
assert.deepEqual(await applyCommand(db, owner, c), before);
assert.equal(applied(before).project.version, 1);
await db.end();
console.log("PASS: replay after PostgreSQL restart is identical, version 1");
