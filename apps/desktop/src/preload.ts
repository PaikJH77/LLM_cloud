import {contextBridge,ipcRenderer} from 'electron';import type {PlannerBridge} from './bridge';
async function call(method:string,payload?:unknown){const r=await ipcRenderer.invoke('planner',method,payload);if(!r.ok)throw Object.assign(new Error(r.message),{code:r.code});return r.value;}
const bridge:PlannerBridge={login:()=>call('login'),session:()=>call('session'),logout:choice=>call('logout',choice),protection:()=>call('protection'),listProjects:filter=>call('listProjects',filter),getProject:id=>call('getProject',id),mutate:c=>call('mutate',c),requestStatus:id=>call('requestStatus',id),drafts:{save:d=>call('saveDraft',d),load:()=>call('loadDrafts'),remove:(_key,id)=>call('removeDraft',id)}};
contextBridge.exposeInMainWorld('planner',bridge);
