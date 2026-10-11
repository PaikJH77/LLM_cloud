import type {Pool,PoolClient} from 'pg';
import type {Principal,Snapshot,Project,Task,ProjectListFilter,ProjectListItem,MutationResult} from '../../../../packages/core/src/model';
import {summarizeProgress} from '../../../../packages/core/src/progress';
import {filterSchema} from '../../../../packages/core/src/contracts';
type DB=Pool|PoolClient;
export async function getSnapshot(db:DB,principal:Principal,projectId:string):Promise<Snapshot>{
 const p=await db.query("SELECT p.data, COALESCE(jsonb_agg(t.data) FILTER (WHERE t.id IS NOT NULL),'[]') AS tasks FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.id=$1 AND p.owner_id=$2 GROUP BY p.id",[projectId,principal.ownerId]);
 if(!p.rows[0])throw new Error('NOT_FOUND');
 return {project:p.rows[0].data as Project,tasks:(p.rows[0].tasks as Task[]).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))};
}
export async function listProjects(db:DB,p:Principal,input:ProjectListFilter):Promise<ProjectListItem[]>{
 const filter=filterSchema.parse(input);
 // One statement gives a consistent list and task aggregate snapshot.
 const rows=await db.query('SELECT p.data, COALESCE(jsonb_agg(t.data) FILTER (WHERE t.id IS NOT NULL),\'[]\') AS tasks FROM projects p LEFT JOIN tasks t ON t.project_id=p.id WHERE p.owner_id=$1 GROUP BY p.id',[p.ownerId]);
 const items:ProjectListItem[]=rows.rows.map(r=>({project:r.data,progress:summarizeProgress(r.tasks)}));
 return items.filter(({project:p})=>(filter.state==='trashed'?p.deletedAt!==null:p.deletedAt===null&&(filter.state==='archived'?p.archivedAt!==null:p.archivedAt===null))&&p.name.toLowerCase().includes(filter.query.toLowerCase())).sort((a,b)=>{const p=a.project,q=b.project;return (filter.sort==='deadlineAsc'?(p.deadline??'9999-99-99').localeCompare(q.deadline??'9999-99-99'):q.updatedAt.localeCompare(p.updatedAt))||p.id.localeCompare(q.id)});
}
export async function readRequest(db:DB,p:Principal,id:string):Promise<MutationResult|null>{const r=await db.query('SELECT result FROM requests WHERE owner_id=$1 AND request_id=$2',[p.ownerId,id]);return r.rows[0]?.result??null;}
