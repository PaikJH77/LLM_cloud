import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
const directory=new URL("../apps/api/migrations/",import.meta.url);
const tables=["principals","projects","tasks","requests"];
async function shape(client:PoolClient,schema:string){
 const columns=await client.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2) ORDER BY table_name,ordinal_position`,[schema,tables]);
 const constraints=await client.query(`SELECT c.relname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2) ORDER BY c.relname,definition`,[schema,tables]);
 const indexes=await client.query(`SELECT tablename,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=ANY($2) ORDER BY tablename,indexname`,[schema,tables]);
 return JSON.stringify([columns.rows,constraints.rows,indexes.rows]).replaceAll(schema+".","SCHEMA.");
}
export async function runMigrations(db:Pool){
 const client=await db.connect();
 try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(917441,1)");
 const schema=(await client.query("SELECT current_schema() AS name")).rows[0].name as string;
 const history=(await client.query("SELECT to_regclass('planner_migrations') AS table")).rows[0].table;
 const initial=await readFile(new URL("001_initial.sql",directory),"utf8");
 if(!history && (await client.query("SELECT to_regclass('principals') AS table")).rows[0].table){
 const actual=await shape(client,schema);const reference="planner_reference_"+randomUUID().replaceAll("-","");
 await client.query(`CREATE SCHEMA ${reference}`);await client.query(`SET LOCAL search_path TO ${reference}`);await client.query(initial);const expected=await shape(client,reference);
 await client.query(`SET LOCAL search_path TO "${schema.replaceAll('"','""')}"`);await client.query(`DROP SCHEMA ${reference} CASCADE`);
 if(actual!==expected)throw new Error("Unmanaged schema differs from migration 001; audited migration required");
 }
 await client.query("CREATE TABLE IF NOT EXISTS planner_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
 for(const name of (await readdir(directory)).filter(n=>/^\d+_.+\.sql$/.test(n)).sort()){
 const sql=await readFile(new URL(name,directory),"utf8"),checksum=createHash("sha256").update(sql).digest("hex");
 const old=await client.query("SELECT checksum FROM planner_migrations WHERE name=$1",[name]);
 if(old.rowCount){if(old.rows[0].checksum!==checksum)throw new Error("Migration checksum mismatch: "+name);continue;}
 await client.query(sql);await client.query("INSERT INTO planner_migrations(name,checksum) VALUES($1,$2)",[name,checksum]);
 }
 await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
