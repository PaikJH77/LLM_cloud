import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {commandSchema} from '../../../../packages/core/src/contracts';
import type {Command,Principal,MutationResult,Snapshot,RejectCode} from '../../../../packages/core/src/model';
import {getSnapshot} from './queries';
const reject=(code:RejectCode):MutationResult=>({kind:'rejected',code});
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(value);}
export async function applyCommand(db:Pool,principal:Principal,input:Command):Promise<MutationResult>{
 const parsed=commandSchema.safeParse(input);if(!parsed.success)return reject('INVALID_INPUT');
 const c=parsed.data as Command,hash=createHash('sha256').update(canonical(c)).digest('hex');
 const client=await db.connect();
 try{
 await client.query('BEGIN');
 const reserved=await client.query('INSERT INTO requests(owner_id,request_id,project_id,expected_version,body_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING request_id',[principal.ownerId,c.requestId,c.projectId,c.expectedVersion,hash]);
 if(!reserved.rowCount){const {rows}=await client.query('SELECT body_hash,result FROM requests WHERE owner_id=$1 AND request_id=$2 FOR UPDATE',[principal.ownerId,c.requestId]);await client.query('COMMIT');return rows[0].body_hash===hash?rows[0].result:reject('REQUEST_ID_REUSED');}
 // Also serializes creation while no project row exists yet; collisions only add serialization.
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[c.projectId]);
 const existing=await client.query('SELECT owner_id FROM projects WHERE id=$1 FOR UPDATE',[c.projectId]);
 let result:MutationResult;
 if(existing.rowCount&&existing.rows[0].owner_id!==principal.ownerId)result=reject('NOT_FOUND');
 else if(c.operation.type==='createProject'){
 if(c.expectedVersion!==0)result=reject('INVALID_INPUT');
 else if(existing.rowCount)result={kind:'conflict',latest:await getSnapshot(client,principal,c.projectId)};
 else {const now=new Date().toISOString();const snapshot:Snapshot={project:{id:c.projectId,ownerId:principal.ownerId,...c.operation.fields,version:1,createdAt:now,updatedAt:now,archivedAt:null,deletedAt:null},tasks:[]};await client.query('INSERT INTO projects VALUES($1,$2,$3,$4)',[c.projectId,principal.ownerId,1,snapshot.project]);result={kind:'applied',snapshot};}
 }else if(!existing.rowCount)result=reject('NOT_FOUND');
 else {
 const snapshot=await getSnapshot(client,principal,c.projectId),p=snapshot.project,op=c.operation;
 if(p.version!==c.expectedVersion)result={kind:'conflict',latest:snapshot};
 else if(p.deletedAt&&op.type!=='restoreProject')result=reject('DELETED');
 else if(p.archivedAt&&!['unarchiveProject','trashProject','restoreProject'].includes(op.type))result=reject('ARCHIVED');
 else {
 const now=new Date().toISOString();let failure:RejectCode|null=null;
 switch(op.type){
 case 'updateProject':Object.assign(p,op.fields);break;
 case 'archiveProject':p.archivedAt=now;break;
 case 'unarchiveProject':p.archivedAt=null;break;
 case 'trashProject':p.deletedAt=now;for(const t of snapshot.tasks)if(!t.deletedAt){t.deletedAt=now;t.deletedByProjectRequestId=c.requestId;t.updatedAt=now;}break;
 case 'restoreProject':{const groups=new Set(snapshot.tasks.filter(t=>t.deletedAt===p.deletedAt&&t.deletedByProjectRequestId).map(t=>t.deletedByProjectRequestId));p.deletedAt=null;for(const t of snapshot.tasks)if(t.deletedByProjectRequestId&&groups.has(t.deletedByProjectRequestId)){t.deletedAt=null;t.deletedByProjectRequestId=null;t.updatedAt=now;}break;}
 case 'createTask':{
 const duplicate=await client.query('SELECT id FROM tasks WHERE id=$1',[op.taskId]);if(duplicate.rowCount){failure='INVALID_INPUT';break;}
 snapshot.tasks.push({id:op.taskId,projectId:p.id,...op.fields,position:snapshot.tasks.filter(t=>!t.deletedAt).length,createdAt:now,updatedAt:now,deletedAt:null,deletedByProjectRequestId:null});break;}
 case 'updateTask':case 'trashTask':case 'restoreTask':{
 const t=snapshot.tasks.find(t=>t.id===op.taskId);if(!t){failure='NOT_FOUND';break;}
 if(t.deletedAt&&op.type!=='restoreTask'){failure='DELETED';break;}
 if(op.type==='updateTask')Object.assign(t,op.fields);else if(op.type==='trashTask'){t.deletedAt=now;t.deletedByProjectRequestId=null;}else {t.deletedAt=null;t.deletedByProjectRequestId=null;}t.updatedAt=now;break;}
 case 'reorderTasks':{const live=snapshot.tasks.filter(t=>!t.deletedAt);if(op.taskIds.length!==live.length||new Set(op.taskIds).size!==live.length||op.taskIds.some(id=>!live.some(t=>t.id===id))){failure='INVALID_INPUT';break;}for(const t of live){t.position=op.taskIds.indexOf(t.id);t.updatedAt=now;}break;}
 }
 if(failure)result=reject(failure);else{
 snapshot.tasks.filter(t=>!t.deletedAt).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id)).forEach((t,i)=>t.position=i);
 p.version++;p.updatedAt=now;
 await client.query('UPDATE projects SET version=$2,data=$3 WHERE id=$1',[p.id,p.version,p]);
 for(const t of snapshot.tasks)await client.query('INSERT INTO tasks(id,project_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data',[t.id,p.id,t]);
 result={kind:'applied',snapshot:await getSnapshot(client,principal,c.projectId)};
 }
 }
 }
 await client.query('UPDATE requests SET result=$3 WHERE owner_id=$1 AND request_id=$2',[principal.ownerId,c.requestId,result]);await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
