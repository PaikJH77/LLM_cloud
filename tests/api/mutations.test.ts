import { beforeAll,afterAll,it,expect } from 'vitest';
import {randomUUID} from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../../apps/api/src/db';
import { applyCommand } from '../../apps/api/src/projects/mutate';
import { getSnapshot,listProjects,readRequest } from '../../apps/api/src/projects/queries';
import {owner,other,command,applied,dbUrl} from '../support/fixtures';
const db=new Pool({connectionString:dbUrl});
beforeAll(async()=>{await migrate(db)});afterAll(()=>db.end());
async function create(name='프로젝트'){const c=command(randomUUID(),0,{type:'createProject',fields:{name,deadline:null}});return {c,s:applied(await applyCommand(db,owner,c))};}
it('serializes competing versions and increments on task changes',async()=>{const {s}=await create();const id=randomUUID();const results=await Promise.all(['A','B'].map(name=>applyCommand(db,owner,command(s.project.id,1,{type:'createTask',taskId:id,fields:{name,start:null,end:null,progress:0}}))));expect(results.map(r=>r.kind).sort()).toEqual(['applied','conflict']);expect((await getSnapshot(db,owner,s.project.id)).project.version).toBe(2)});
it('deduplicates concurrent creation and rejects changed bodies',async()=>{const c=command(randomUUID(),0,{type:'createProject',fields:{name:'중복',deadline:null}});const r=await Promise.all(Array.from({length:8},()=>applyCommand(db,owner,c)));for(const result of r)expect(result).toEqual(r[0]);expect(applied(r[0]).project.version).toBe(1);expect(await readRequest(db,owner,c.requestId)).toEqual(r[0]);expect(await applyCommand(db,owner,{...c,operation:{type:'createProject',fields:{name:'변경',deadline:null}}})).toEqual({kind:'rejected',code:'REQUEST_ID_REUSED'});expect((await db.query('SELECT count(*) FROM projects WHERE id=$1',[c.projectId])).rows[0].count).toBe('1')});
it('restores only tasks trashed with the project and enforces archived/deleted states',async()=>{let {s}=await create();const a=randomUUID(),b=randomUUID();const send=async(operation:any)=>s=applied(await applyCommand(db,owner,command(s.project.id,s.project.version,operation)));
 for(const taskId of [a,b])await send({type:'createTask',taskId,fields:{name:taskId,start:null,end:null,progress:null}});
 await send({type:'trashTask',taskId:a});await send({type:'trashProject'});await send({type:'restoreProject'});
 expect(s.tasks.find(t=>t.id===a)?.deletedAt).not.toBeNull();expect(s.tasks.find(t=>t.id===b)?.deletedAt).toBeNull();
 expect(await applyCommand(db,owner,command(s.project.id,s.project.version,{type:'updateTask',taskId:a,fields:{name:'no',start:null,end:null,progress:100}}))).toEqual({kind:'rejected',code:'DELETED'});
 await send({type:'archiveProject'});expect(await applyCommand(db,owner,command(s.project.id,s.project.version,{type:'trashTask',taskId:b}))).toEqual({kind:'rejected',code:'ARCHIVED'});
 await send({type:'trashProject'});await send({type:'restoreProject'});expect(s.project.archivedAt).not.toBeNull();
});
it('isolates owners, includes progress, sorts null deadlines last, rejects invalid permutations',async()=>{let {s}=await create('UniqueSearchAbC');expect(await readRequest(db,other,randomUUID())).toBeNull();await expect(getSnapshot(db,other,s.project.id)).rejects.toThrow('NOT_FOUND');expect(await applyCommand(db,other,command(s.project.id,1,{type:'trashProject'}))).toEqual({kind:'rejected',code:'NOT_FOUND'});
 const id=randomUUID();s=applied(await applyCommand(db,owner,command(s.project.id,1,{type:'createTask',taskId:id,fields:{name:'zero',start:null,end:null,progress:0}})));
 expect((await listProjects(db,owner,{state:'active',query:'uniquesearchabc',sort:'deadlineAsc'}))[0].progress).toEqual({value:0,entered:1,total:1});
 expect(await applyCommand(db,owner,command(s.project.id,s.project.version,{type:'reorderTasks',taskIds:[id,id]}))).toEqual({kind:'rejected',code:'INVALID_INPUT'});
});
it('validates untrusted commands and concurrent distinct create request ids',async()=>{expect(await applyCommand(db,owner,{} as any)).toEqual({kind:'rejected',code:'INVALID_INPUT'});const id=randomUUID();const r=await Promise.all([1,2].map(()=>applyCommand(db,owner,command(id,0,{type:'createProject',fields:{name:'one',deadline:null}}))));expect(r.map(x=>x.kind).sort()).toEqual(['applied','conflict'])});
it('rejects creation at a nonzero base and returns coherent snapshots during writes',async()=>{
 expect(await applyCommand(db,owner,command(randomUUID(),2,{type:'createProject',fields:{name:'invalid',deadline:null}}))).toEqual({kind:'rejected',code:'INVALID_INPUT'});
 let {s}=await create();const taskId=randomUUID();s=applied(await applyCommand(db,owner,command(s.project.id,1,{type:'createTask',taskId,fields:{name:'2',start:null,end:null,progress:0}})));
 const writes=(async()=>{for(let v=2;v<25;v++)await applyCommand(db,owner,command(s.project.id,v,{type:'updateTask',taskId,fields:{name:String(v+1),start:null,end:null,progress:0}}))})();
 try {for(let i=0;i<50;i++){const read=await getSnapshot(db,owner,s.project.id);expect(Number(read.tasks[0].name)).toBe(read.project.version)}}finally{await writes;}
});
