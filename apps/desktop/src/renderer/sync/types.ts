import type {Draft,Snapshot,Instant,DraftFields,Operation} from '../../../../../packages/core/src/model';
export interface Clock {now():Date;setInterval(fn:()=>void,ms:number):unknown;clearInterval(id:unknown):void;}
export interface SyncState {snapshot:Snapshot|null;draft:Draft|null;status:'loading'|'saved'|'editing'|'saving'|'failed'|'offline'|'expired'|'conflict';lastConfirmedAt:Instant|null;error:string|null;}
export interface SyncController {readonly state:SyncState;open(id:string):Promise<void>;openNew(id:string):Promise<void>;edit(fields:DraftFields):Promise<void>;commit(op:Operation):Promise<void>;refresh():Promise<void>;resolveConflict(choice:'latest'|'reapply'):Promise<void>;subscribe(fn:(s:SyncState)=>void):()=>void;dispose():void;}
