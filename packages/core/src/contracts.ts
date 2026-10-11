import { z } from 'zod';
import { parseDateOnly } from './dates';
export const dateSchema=z.string().refine(v=>{try{parseDateOnly(v);return true;}catch{return false}},'올바른 날짜가 필요합니다');
const name=z.string().trim().min(1).max(500);
export const projectFieldsSchema=z.strictObject({name,deadline:dateSchema.nullable()});
export const taskFieldsSchema=z.strictObject({name,start:dateSchema.nullable(),end:dateSchema.nullable(),progress:z.number().int().min(0).max(100).nullable()}).refine(t=>(t.start===null)===(t.end===null),'시작일과 종료일을 함께 입력하세요').refine(t=>!t.start||!t.end||t.start<=t.end,'종료일은 시작일 이후여야 합니다');
export const operationSchema=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('createProject'),fields:projectFieldsSchema}),z.strictObject({type:z.literal('updateProject'),fields:projectFieldsSchema}),
 ...(['archiveProject','unarchiveProject','trashProject','restoreProject'] as const).map(type=>z.strictObject({type:z.literal(type)})),
 ...(['createTask','updateTask'] as const).map(type=>z.strictObject({type:z.literal(type),taskId:z.uuid(),fields:taskFieldsSchema})),
 ...(['trashTask','restoreTask'] as const).map(type=>z.strictObject({type:z.literal(type),taskId:z.uuid()})),
 z.strictObject({type:z.literal('reorderTasks'),taskIds:z.array(z.uuid()).max(10000)})
]);
export const commandSchema=z.strictObject({requestId:z.uuid(),projectId:z.uuid(),expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),operation:operationSchema});
export const filterSchema=z.strictObject({state:z.enum(['active','archived','trashed']),query:z.string().max(500),sort:z.enum(['deadlineAsc','updatedDesc'])});
export function principalKey(p:{issuer:string;subject:string}):string{return JSON.stringify([p.issuer,p.subject]);}
