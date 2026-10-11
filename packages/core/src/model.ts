export type DateOnly = string;
export type Instant = string;
export type Principal = {
  ownerId: string;
  issuer: string;
  subject: string;
};
export type Project = {
  id: string;
  ownerId: string;
  name: string;
  deadline: DateOnly | null;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  archivedAt: Instant | null;
  deletedAt: Instant | null;
};
export type Task = {
  id: string;
  projectId: string;
  name: string;
  start: DateOnly | null;
  end: DateOnly | null;
  progress: number | null;
  position: number;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
  deletedByProjectRequestId: string | null;
};
export type ProgressSummary = {
  value: number | null;
  entered: number;
  total: number;
};
export type Snapshot = { project: Project; tasks: Task[] };
export type ProjectListItem = { project: Project; progress: ProgressSummary };
export type ProjectListFilter = {
  state: "active" | "archived" | "trashed";
  query: string;
  sort: "deadlineAsc" | "updatedDesc";
};
export type ProjectFields = { name: string; deadline: DateOnly | null };
export type TaskFields = {
  name: string;
  start: DateOnly | null;
  end: DateOnly | null;
  progress: number | null;
};
export type Operation =
  | { type: "createProject"; fields: ProjectFields }
  | { type: "updateProject"; fields: ProjectFields }
  | { type: "archiveProject" }
  | { type: "unarchiveProject" }
  | { type: "trashProject" }
  | { type: "restoreProject" }
  | { type: "createTask"; taskId: string; fields: TaskFields }
  | { type: "updateTask"; taskId: string; fields: TaskFields }
  | { type: "trashTask"; taskId: string }
  | { type: "restoreTask"; taskId: string }
  | { type: "reorderTasks"; taskIds: string[] };
export type Command = {
  requestId: string;
  projectId: string;
  expectedVersion: number;
  operation: Operation;
};
export type RejectCode =
  "INVALID_INPUT" | "NOT_FOUND" | "ARCHIVED" | "DELETED" | "REQUEST_ID_REUSED";
export type MutationResult =
  | { kind: "applied"; snapshot: Snapshot }
  | { kind: "conflict"; latest: Snapshot }
  | { kind: "rejected"; code: RejectCode };
export type DraftFields =
  | { kind: "project"; name: string; deadline: string }
  | {
      kind: "task";
      taskId: string;
      name: string;
      start: string;
      end: string;
      progress: string;
    }
  | { kind: "operation"; operation: Operation };
export type Draft = {
  principalKey: string;
  projectId: string;
  base: Snapshot | null;
  editedFields: DraftFields;
  command: Command | null;
  phase: "editing" | "prepared" | "unknown" | "conflict";
  savedLocallyAt: Instant;
};
export interface PlannerGateway {
  listProjects(filter: ProjectListFilter): Promise<ProjectListItem[]>;
  getProject(id: string): Promise<Snapshot>;
  mutate(command: Command): Promise<MutationResult>;
  requestStatus(requestId: string): Promise<MutationResult | null>;
}
export interface DraftStore {
  save(draft: Draft): Promise<void>;
  load(principalKey: string): Promise<Draft[]>;
  remove(principalKey: string, projectId: string): Promise<void>;
}
