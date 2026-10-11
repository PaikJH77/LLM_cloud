import { resolve } from "node:path";
import { createWebServer } from "../apps/web/src/server/app";
import { getWebPool } from "../apps/web/src/server/pool";
import { createAuthenticator } from "../apps/api/src/auth";
function required(name:string){const value=process.env[name];if(!value)throw new Error(name+" required");return value;}
const db=getWebPool(required("DATABASE_URL"),process.env.PLANNER_LOCAL_TEST==="1");
const issuer=required("OIDC_ISSUER"),audience=required("OIDC_AUDIENCE");
const authenticate=await createAuthenticator({db,issuer,audience,allowLoopbackHttp:process.env.PLANNER_LOCAL_TEST==="1"});
const app=await createWebServer({db,authenticate,origin:required("APP_ORIGIN"),staticRoot:resolve("dist/web"),publicConfig:{issuer,audience,clientId:required("OIDC_CLIENT_ID")}});
await app.listen({port:Number(process.env.PORT||3000),host:"0.0.0.0"});
