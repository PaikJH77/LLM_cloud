import Fastify from "fastify";
import staticFiles from "@fastify/static";
import type { Pool } from "pg";
import { ZodError } from "zod";
import type { Principal } from "../../../../packages/core/src/model";
import { AuthenticationError } from "../../../api/src/auth";
import { registerRoutes } from "../../../api/src/projects/routes";
export type PublicConfig = { issuer: string; clientId: string; audience: string };
export interface WebConfig {
 staticRoot: string; origin: string; db: Pool;
 authenticate: (token: string) => Promise<Principal>;
 publicConfig: PublicConfig;
}
export async function createWebServer(config: WebConfig) {
 const app=Fastify({logger:false,bodyLimit:1_048_576});
 app.addHook("onSend",async(req,reply,payload)=>{
 reply.header("X-Content-Type-Options","nosniff").header("Referrer-Policy","no-referrer").header("Cache-Control","private, no-store");
 reply.header("Content-Security-Policy",`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${new URL(config.publicConfig.issuer).origin}; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
 if(req.url.startsWith("/assets/") && reply.statusCode===200) reply.header("Cache-Control","public, max-age=31536000, immutable");
 return payload;
 });
 await app.register(staticFiles,{root:config.staticRoot,prefix:"/",serve:false});
 app.get("/",(_,reply)=>reply.sendFile("index.html"));
 app.get("/auth/callback",(_,reply)=>reply.sendFile("index.html"));
 app.get("/assets/:name",(req,reply)=>{
 const name=(req.params as {name:string}).name;
 if(!/^[a-zA-Z0-9._-]+$/.test(name))return reply.code(404).send({error:"NOT_FOUND"});
 return reply.sendFile("assets/"+name);
 });
 app.get("/config",()=>config.publicConfig);
 await app.register(async(api)=>{
 api.addHook("onRequest",async(req,reply)=>{
 const bearer=req.headers.authorization;
 if(!bearer?.startsWith("Bearer "))return reply.code(401).send({error:"UNAUTHORIZED"});
 if(!["GET","HEAD"].includes(req.method) && (req.headers.origin!==config.origin || req.headers["content-type"]?.split(";")[0]!=="application/json"))return reply.code(403).send({error:"FORBIDDEN"});
 try {req.principal=await config.authenticate(bearer.slice(7));} catch(e){return reply.code(e instanceof AuthenticationError?401:503).send({error:e instanceof AuthenticationError?"UNAUTHORIZED":"UNAVAILABLE"});}
 });
 api.setErrorHandler((error,_req,reply)=>{
 if(error instanceof ZodError)return reply.code(422).send({error:"INVALID_INPUT"});
 if(error instanceof Error && error.message==="NOT_FOUND")return reply.code(404).send({error:"NOT_FOUND"});
 if((error as {statusCode?:number}).statusCode===413)return reply.code(413).send({error:"TOO_LARGE"});
 return reply.code(503).send({error:"UNAVAILABLE"});
 });
 registerRoutes(api,config.db);
 },{prefix:"/api"});
 return app;
}
