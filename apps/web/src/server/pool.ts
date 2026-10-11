import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
export function createPoolManager() {
 let pool:Pool|undefined; let configuration:string|undefined;
 return (connectionString:string,allowLoopbackHttp=false)=>{
 const url=new URL(connectionString);
 const local=allowLoopbackHttp && ["127.0.0.1","localhost","[::1]"].includes(url.hostname);
 if(!local && [...url.searchParams.keys()].some(k=>k.startsWith("ssl")))throw new Error("Use verified TLS without URL SSL overrides");
 if(pool && configuration!==connectionString)throw new Error("Pool configuration changed");
 if(!pool){pool=new Pool({connectionString,max:5,idleTimeoutMillis:5000,connectionTimeoutMillis:5000,statement_timeout:15000,lock_timeout:5000,ssl:local?false:{rejectUnauthorized:true}});configuration=connectionString;attachDatabasePool(pool);pool.on("error",()=>{/* Do not log connection credentials. Requests report unavailable. */});}
 return pool;
 };
}
export const getWebPool=createPoolManager();
