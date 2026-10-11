import type {PlannerGateway,DraftStore,Principal} from '../../../packages/core/src/model';
export interface PlannerBridge extends PlannerGateway {login():Promise<Principal>;session():Promise<Principal|null>;logout(choice:'keep'|'discard'):Promise<void>;protection():Promise<boolean>;drafts:DraftStore;}
declare global {interface Window {planner:PlannerBridge;}}
