import {Pool,migrate} from './db';import {createServer} from './server';
const {DATABASE_URL,OIDC_ISSUER,OIDC_AUDIENCE}=process.env;if(!DATABASE_URL||!OIDC_ISSUER||!OIDC_AUDIENCE)throw new Error('DATABASE_URL, OIDC_ISSUER and OIDC_AUDIENCE are required');
const db=new Pool({connectionString:DATABASE_URL});await migrate(db);const app=await createServer({db,issuer:OIDC_ISSUER,audience:OIDC_AUDIENCE,allowLoopbackHttp:process.env.NODE_ENV==='test'});await app.listen({host:'127.0.0.1',port:Number(process.env.PORT??4318)});console.log('Planner API listening on loopback');
for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{await app.close();await db.end();process.exit(0)});
