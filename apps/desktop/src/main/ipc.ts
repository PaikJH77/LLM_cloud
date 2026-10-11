import {ipcMain,type BrowserWindow} from 'electron';import type {Principal,Draft} from '../../../../packages/core/src/model';import {principalKey} from '../../../../packages/core/src/contracts';import {validateCaller,validateCall} from './ipc-policy';import type {ProtectedDraftStore} from './draft-store';import type {ApiClient} from './api-client';
export function registerIpc(win:BrowserWindow,url:string,api:ApiClient,store:ProtectedDraftStore,session:{get():Principal|null;login():Promise<Principal>;logout():void;epoch():number}){
 ipcMain.handle('planner',async(event,method:string,payload:unknown)=>{const requestEpoch=session.epoch();try{
 validateCaller({senderId:event.sender.id,expectedId:win.webContents.id,isMainFrame:event.senderFrame===win.webContents.mainFrame,url:event.senderFrame?.url??'',expectedUrl:url});const value=validateCall(method,payload);const epoch=session.epoch();
 if(method==='login')return {ok:true,value:await session.login()};
 if(method==='session')return {ok:true,value:session.get()};
 if(method==='protection')return {ok:true,value:store.available()};
 const principal=session.get();if(!principal)throw Object.assign(new Error('로그인이 필요합니다'),{code:'expired'});const key=principalKey(principal);let result:unknown;
 switch(method){
 case 'logout':await store.flush();if(value==='discard')for(const d of await store.load(key))await store.remove(key,d.projectId);session.logout();return {ok:true,value:null};
 case 'listProjects':result=await api.listProjects(value as any);break;
 case 'getProject':result=await api.getProject(value as string);break;
 case 'mutate':if(!store.available())throw new Error('보호 저장소를 사용할 수 없습니다');result=await api.mutate(value as any);break;
 case 'requestStatus':result=await api.requestStatus(value as string);break;
 case 'loadDrafts':await api.session();result=await store.load(key);break;
 case 'saveDraft':{const draft=value as Draft;if(draft.principalKey!==key)throw new Error('Wrong draft principal');await store.save(draft);break;}
 case 'removeDraft':await store.remove(key,value as string);break;
 }
 if(epoch!==session.epoch())throw Object.assign(new Error('계정이 변경되었습니다'),{code:'expired'});return {ok:true,value:result};
 }catch(error){const code=(error as {code?:string}).code;if(code==='expired'&&requestEpoch===session.epoch())session.logout();return {ok:false,code:code??'failed',message:error instanceof Error?error.message:'요청 실패'};}});
}
