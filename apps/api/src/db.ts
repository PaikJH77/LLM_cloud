import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
export { Pool };
export async function migrate(db:Pool){await db.query(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));}
