import type { PlannerBridge } from "../../apps/desktop/src/bridge";
import type {
  Snapshot,
  Draft,
  Command,
  MutationResult,
} from "../../packages/core/src/model";
import { summarizeProgress } from "../../packages/core/src/progress";
import { commandSchema } from "../../packages/core/src/contracts";
export function mockBridge(): PlannerBridge {
  const owner = {
      ownerId: "11111111-1111-4111-8111-111111111111",
      issuer: "https://mock.invalid",
      subject: "alice",
    },
    data = new Map<string, Snapshot>(),
    requests = new Map<string, MutationResult>(),
    drafts = new Map<string, Draft>();
  let logged = true;
  let offline = false;
  (window as any).mockControls = {
    offline: (value: boolean) => (offline = value),
    requests: () => requests.size,
  };
  const online = () => {
    if (offline)
      throw Object.assign(new Error("시험 연결 끊김"), { code: "offline" });
    if (!logged)
      throw Object.assign(new Error("로그인 필요"), { code: "expired" });
  };
  const bridge: PlannerBridge = {
    login: async () => {
      logged = true;
      return owner;
    },
    session: async () => (logged ? owner : null),
    logout: async (choice) => {
      logged = false;
      if (choice === "discard") drafts.clear();
    },
    protection: async () => true,
    listProjects: async (f) => {
      online();
      return [...data.values()]
        .filter(
          (s) =>
            (f.state === "trashed"
              ? !!s.project.deletedAt
              : !s.project.deletedAt &&
                (f.state === "archived"
                  ? !!s.project.archivedAt
                  : !s.project.archivedAt)) &&
            s.project.name.toLowerCase().includes(f.query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            (f.sort === "deadlineAsc"
              ? (a.project.deadline ?? "9999").localeCompare(
                  b.project.deadline ?? "9999",
                )
              : b.project.updatedAt.localeCompare(a.project.updatedAt)) ||
            a.project.id.localeCompare(b.project.id),
        )
        .map((s) => ({
          project: structuredClone(s.project),
          progress: summarizeProgress(s.tasks),
        }));
    },
    getProject: async (id) => {
      online();
      const s = data.get(id);
      if (!s) throw new Error("NOT_FOUND");
      return structuredClone(s);
    },
    requestStatus: async (id) => {
      online();
      return structuredClone(requests.get(id) ?? null);
    },
    mutate: async (input) => {
      online();
      const c = commandSchema.parse(input) as Command;
      if (requests.has(c.requestId))
        return structuredClone(requests.get(c.requestId)!);
      let s = data.get(c.projectId);
      const op = c.operation,
        now = new Date().toISOString();
      let result: MutationResult;
      if (op.type === "createProject" && !s) {
        s = {
          project: {
            id: c.projectId,
            ownerId: owner.ownerId,
            ...op.fields,
            version: 0,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            deletedAt: null,
          },
          tasks: [],
        };
        data.set(c.projectId, s);
      }
      if (!s) return { kind: "rejected", code: "NOT_FOUND" };
      if (c.expectedVersion !== s.project.version)
        return { kind: "conflict", latest: structuredClone(s) };
      if (
        s.project.archivedAt &&
        !["unarchiveProject", "trashProject", "restoreProject"].includes(
          op.type,
        )
      )
        return { kind: "rejected", code: "ARCHIVED" };
      if (op.type === "updateProject") Object.assign(s.project, op.fields);
      if (op.type === "archiveProject") s.project.archivedAt = now;
      if (op.type === "unarchiveProject") s.project.archivedAt = null;
      if (op.type === "trashProject") {
        s.project.deletedAt = now;
        for (const t of s.tasks)
          if (!t.deletedAt) {
            t.deletedAt = now;
            t.deletedByProjectRequestId = c.requestId;
          }
      }
      if (op.type === "restoreProject") {
        s.project.deletedAt = null;
        for (const t of s.tasks)
          if (t.deletedByProjectRequestId) {
            t.deletedAt = null;
            t.deletedByProjectRequestId = null;
          }
      }
      if (op.type === "createTask")
        s.tasks.push({
          id: op.taskId,
          projectId: s.project.id,
          ...op.fields,
          position: s.tasks.length,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deletedByProjectRequestId: null,
        });
      if ("taskId" in op) {
        const t = s.tasks.find((t) => t.id === op.taskId);
        if (t) {
          if (op.type === "updateTask") Object.assign(t, op.fields);
          if (op.type === "trashTask") t.deletedAt = now;
          if (op.type === "restoreTask") t.deletedAt = null;
        }
      }
      if (op.type === "reorderTasks")
        for (const t of s.tasks) t.position = op.taskIds.indexOf(t.id);
      s.project.version++;
      s.project.updatedAt = now;
      result = { kind: "applied", snapshot: structuredClone(s) };
      requests.set(c.requestId, result);
      return structuredClone(result);
    },
    drafts: {
      save: async (d) => {
        drafts.set(d.projectId, structuredClone(d));
      },
      load: async (key) =>
        [...drafts.values()]
          .filter((d) => d.principalKey === key)
          .map((d) => structuredClone(d)),
      remove: async (_k, id) => {
        drafts.delete(id);
      },
    },
  };
  return bridge;
}
