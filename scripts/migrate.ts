import { getWebPool } from "../apps/web/src/server/pool";
import { runMigrations } from "./migrations";
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error("MIGRATION_DATABASE_URL required; never run migrations in a request or build");
const db=getWebPool(url,process.env.PLANNER_LOCAL_TEST==="1");
try{await runMigrations(db);console.log("Migrations verified and applied");}finally{await db.end();}
