import { it, expect } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "../../scripts/migrations";
import { dbUrl } from "../support/fixtures";
import { createPoolManager } from "../../apps/web/src/server/pool";
it("reuses a bounded instance pool and rejects insecure remote DB",async()=>{
 const manager=createPoolManager();expect(manager(dbUrl,true)).toBe(manager(dbUrl,true));
 expect(()=>createPoolManager()("postgres://x:y@example.com/db?sslmode=disable")).toThrow();
 await manager(dbUrl,true).end();
});
it("tracks transactional migrations, detects checksum drift, and refuses unmanaged schema",async()=>{
 const admin=new Pool({connectionString:dbUrl});const schema="web_migrate_"+Date.now();await admin.query(`CREATE SCHEMA ${schema}`);
 const db=new Pool({connectionString:dbUrl,options:`-c search_path=${schema}`});
 try {await runMigrations(db);await runMigrations(db);expect((await db.query("SELECT * FROM planner_migrations")).rowCount).toBeGreaterThan(0);
 await db.query("UPDATE planner_migrations SET checksum='tampered'");await expect(runMigrations(db)).rejects.toThrow(/checksum/);
 } finally {await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
