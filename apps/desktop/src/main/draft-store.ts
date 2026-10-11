import {mkdir,readFile,readdir,rename,writeFile,unlink} from 'node:fs/promises';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {z} from 'zod';import type {Draft,DraftStore} from '../../../../packages/core/src/model';
export interface Protector {available():boolean;encrypt(text:string):Buffer;decrypt(data:Buffer):string;}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export class ProtectedDraftStore implements DraftStore {
 private pending:Promise<void>=Promise.resolve();
 constructor(private root:string,private protector:Protector){}
 available(){return this.protector.available();}
 private ensure(){if(!this.available())throw new Error('보호 저장소를 사용할 수 없어 편집이 잠겼습니다');}
 private folder(key:string){return join(this.root,hash(key));}
 private file(key:string,id:string){z.uuid().parse(id);return join(this.folder(key),id+'.bin');}
 private queue(fn:()=>Promise<void>):Promise<void>{const work=this.pending.then(fn);this.pending=work.catch(()=>{});return work;}
 flush(){return this.pending;}
 save(draft:Draft):Promise<void>{const copy=structuredClone(draft);return this.queue(async()=>{this.ensure();const serialized=JSON.stringify(copy);if(serialized.length>4_000_000)throw new Error('초안이 너무 큽니다');const encrypted=this.protector.encrypt(serialized);const target=this.file(copy.principalKey,copy.projectId),temp=target+'.'+randomUUID()+'.tmp';await mkdir(this.folder(copy.principalKey),{recursive:true,mode:0o700});try{await writeFile(temp,encrypted,{mode:0o600,flag:'wx'});await rename(temp,target);}finally{await unlink(temp).catch(()=>{});}});}
 async load(key:string):Promise<Draft[]>{await this.pending;this.ensure();let names:string[];try{names=await readdir(this.folder(key));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}const results:Draft[]=[];for(const name of names.filter(n=>n.endsWith('.bin'))){const id=name.slice(0,-4);const draft=JSON.parse(this.protector.decrypt(await readFile(this.file(key,id)))) as Draft;if(draft.principalKey!==key||draft.projectId!==id||!draft.editedFields||!['editing','prepared','unknown','conflict'].includes(draft.phase))throw new Error('보호된 초안 복구에 실패했습니다');results.push(draft);}return results;}
 remove(key:string,id:string):Promise<void>{return this.queue(async()=>{this.ensure();try{await unlink(this.file(key,id));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}});}
}
