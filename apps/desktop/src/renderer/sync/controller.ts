import type {
  PlannerGateway,
  DraftStore,
  Principal,
  DraftFields,
  Operation,
  Command,
  MutationResult,
  Draft,
  Snapshot,
} from "../../../../../packages/core/src/model";
import {
  principalKey,
  operationSchema,
} from "../../../../../packages/core/src/contracts";
import type { Clock, SyncState, SyncController } from "./types";
export const browserClock: Clock = {
  now: () => new Date(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};
function fieldsFor(op: Operation): DraftFields {
  if (op.type === "createProject" || op.type === "updateProject")
    return {
      kind: "project",
      name: op.fields.name,
      deadline: op.fields.deadline ?? "",
    };
  if (op.type === "createTask" || op.type === "updateTask")
    return {
      kind: "task",
      taskId: op.taskId,
      name: op.fields.name,
      start: op.fields.start ?? "",
      end: op.fields.end ?? "",
      progress: op.fields.progress === null ? "" : String(op.fields.progress),
    };
  return { kind: "operation", operation: op };
}
function reapply(draft: Draft, latest: Snapshot): Operation {
  const op = draft.command?.operation;
  if (!op) throw new Error("유효한 변경안을 먼저 확인하세요");
  if (latest.project.deletedAt && op.type !== "restoreProject")
    throw new Error("삭제된 프로젝트는 먼저 복원해야 합니다");
  if (
    latest.project.archivedAt &&
    !["unarchiveProject", "trashProject", "restoreProject"].includes(op.type)
  )
    throw new Error("보관 프로젝트는 먼저 보관 해제해야 합니다");
  if (op.type === "updateProject" && draft.base) {
    const base = draft.base.project;
    return {
      type: "updateProject",
      fields: {
        name:
          op.fields.name === base.name ? latest.project.name : op.fields.name,
        deadline:
          op.fields.deadline === base.deadline
            ? latest.project.deadline
            : op.fields.deadline,
      },
    };
  }
  if (op.type === "updateTask" && draft.base) {
    const base = draft.base.tasks.find((t) => t.id === op.taskId),
      current = latest.tasks.find((t) => t.id === op.taskId);
    if (!base || !current || current.deletedAt)
      throw new Error("삭제된 작업은 먼저 복원해야 합니다");
    return {
      type: "updateTask",
      taskId: op.taskId,
      fields: {
        name: op.fields.name === base.name ? current.name : op.fields.name,
        start: op.fields.start === base.start ? current.start : op.fields.start,
        end: op.fields.end === base.end ? current.end : op.fields.end,
        progress:
          op.fields.progress === base.progress
            ? current.progress
            : op.fields.progress,
      },
    };
  }
  return op;
}
export function createSyncController(
  gateway: PlannerGateway,
  store: DraftStore,
  clock: Clock,
  principal: Principal,
): SyncController {
  let state: SyncState = {
      snapshot: null,
      draft: null,
      status: "loading",
      lastConfirmedAt: null,
      error: null,
    },
    projectId = "",
    revision = 0,
    networkAvailable = true,
    disposed = false,
    refreshing: Promise<void> | null = null,
    writes: Promise<void> = Promise.resolve();
  const listeners = new Set<(s: SyncState) => void>(),
    key = principalKey(principal);
  const emit = (patch: Partial<SyncState>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const fn of listeners) fn(structuredClone(state));
  };
  const fail = (error: unknown, local = false) => {
    const code = (error as { code?: string })?.code;
    emit({
      status:
        code === "expired"
          ? "expired"
          : local
            ? "failed"
            : code === "offline"
              ? "offline"
              : "failed",
      error: local
        ? "초안 보호 저장 실패: " + String(error)
        : error instanceof Error
          ? error.message
          : "저장 실패",
      ...(code === "expired" ? { snapshot: null, draft: null } : {}),
    });
  };
  const persist = (draft: Draft) => {
    const work = writes.then(() => store.save(draft));
    writes = work.catch(() => {});
    return work;
  };
  const requireEditable = () => {
    if (
      disposed ||
      !networkAvailable ||
      !projectId ||
      !["saved", "editing"].includes(state.status)
    )
      throw new Error("현재 편집할 수 없습니다");
  };
  async function finish(
    result: MutationResult,
    requestId: string,
    epoch: number,
  ) {
    if (
      disposed ||
      revision !== epoch ||
      state.draft?.command?.requestId !== requestId
    )
      return;
    if (result.kind === "applied") {
      const latest = await gateway.getProject(projectId);
      if (
        disposed ||
        revision !== epoch ||
        state.draft?.command?.requestId !== requestId
      )
        return;
      await store.remove(key, projectId);
      emit({
        snapshot: latest,
        draft: null,
        status: "saved",
        lastConfirmedAt: clock.now().toISOString(),
        error: null,
      });
    } else if (result.kind === "conflict") {
      const draft = state.draft
        ? { ...state.draft, phase: "conflict" as const }
        : null;
      if (draft) await persist(draft);
      emit({
        snapshot: result.latest,
        draft,
        status: "conflict",
        lastConfirmedAt: clock.now().toISOString(),
        error: "다른 PC에서 변경했습니다",
      });
    } else {
      emit({ status: "conflict", error: result.code });
    }
  }
  async function send(command: Command) {
    if (!networkAvailable) return;
    const epoch = revision;
    try {
      await finish(await gateway.mutate(command), command.requestId, epoch);
    } catch (e) {
      if (disposed || revision !== epoch) return;
      if ((e as { code?: string }).code === "expired") {
        fail(e);
        return;
      }
      if (state.draft) {
        const draft = { ...state.draft, phase: "unknown" as const };
        try {
          await persist(draft);
          emit({ draft });
        } catch (local) {
          fail(local, true);
          return;
        }
      }
      fail(e);
    }
  }
  async function refreshImpl() {
    if (
      disposed ||
      !networkAvailable ||
      !projectId ||
      state.status === "saving" ||
      state.status === "expired"
    )
      return;
    const epoch = revision;
    try {
      const latest =
        state.snapshot === null && state.draft?.base === null
          ? null
          : await gateway.getProject(projectId);
      // Authentication/connectivity must be checked even for an unsent new project.
      if (!latest)
        await gateway.listProjects({
          state: "active",
          query: "",
          sort: "updatedDesc",
        });
      if (
        disposed ||
        revision !== epoch ||
        (state as SyncState).status === "saving"
      )
        return;
      const draft = state.draft;
      // A failed protected write must never be bypassed by polling/reconnect.
      if (draft) {
        try {
          await persist(draft);
        } catch (e) {
          if (!disposed && revision === epoch) fail(e, true);
          return;
        }
        if (disposed || revision !== epoch) return;
      }
      emit({
        snapshot: latest,
        lastConfirmedAt: clock.now().toISOString(),
        error: null,
      });
      if (draft?.command && ["prepared", "unknown"].includes(draft.phase)) {
        emit({ status: "saving" });
        const result = await gateway.requestStatus(draft.command.requestId);
        if (disposed || revision !== epoch) return;
        if (result) await finish(result, draft.command.requestId, epoch);
        else await send(draft.command);
      } else
        emit({
          status: draft
            ? draft.phase === "conflict"
              ? "conflict"
              : "editing"
            : "saved",
        });
    } catch (e) {
      if (!disposed && revision === epoch) fail(e);
    }
  }
  const controller: SyncController = {
    get state() {
      return structuredClone(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(structuredClone(state));
      return () => {
        listeners.delete(fn);
      };
    },
    async open(id) {
      projectId = id;
      emit({ status: "loading" });
      try {
        const snapshot = await gateway.getProject(id);
        const draft =
          (await store.load(key)).find((d) => d.projectId === id) ?? null;
        emit({
          snapshot,
          draft,
          status: "saved",
          lastConfirmedAt: clock.now().toISOString(),
        });
        if (draft) await controller.refresh();
      } catch (e) {
        fail(e);
      }
    },
    async openNew(id) {
      projectId = id;
      try {
        await gateway.listProjects({
          state: "active",
          query: "",
          sort: "updatedDesc",
        });
        const draft =
          (await store.load(key)).find((d) => d.projectId === id) ?? null;
        emit({
          snapshot: null,
          draft,
          status: draft ? "editing" : "saved",
          lastConfirmedAt: clock.now().toISOString(),
        });
        if (draft?.command) await controller.refresh();
      } catch (e) {
        fail(e);
      }
    },
    async edit(fields) {
      requireEditable();
      revision++;
      const draft: Draft = {
        principalKey: key,
        projectId,
        base: state.draft?.base ?? structuredClone(state.snapshot),
        editedFields: fields,
        command: null,
        phase: "editing",
        savedLocallyAt: clock.now().toISOString(),
      };
      emit({ draft, status: "editing", error: null });
      try {
        await persist(draft);
      } catch (e) {
        fail(e, true);
      }
    },
    async commit(operation) {
      requireEditable();
      revision++;
      const parsed = operationSchema.safeParse(operation);
      if (!parsed.success) {
        emit({ error: parsed.error.issues.map((i) => i.message).join(" · ") });
        return;
      }
      const op = parsed.data as Operation;
      const base = state.draft?.base ?? state.snapshot;
      const command: Command = {
        requestId: crypto.randomUUID(),
        projectId,
        expectedVersion: base?.project.version ?? 0,
        operation: op,
      };
      const draft: Draft = {
        principalKey: key,
        projectId,
        base: structuredClone(base),
        editedFields: state.draft?.editedFields ?? fieldsFor(op),
        command,
        phase: "prepared",
        savedLocallyAt: clock.now().toISOString(),
      };
      emit({ draft, status: "saving", error: null });
      try {
        await persist(draft);
      } catch (e) {
        fail(e, true);
        return;
      }
      await send(command);
    },
    async connectionChanged(online) {
      networkAvailable = online;
      if (!online) {
        revision++;
        emit({
          status: "offline",
          error: "연결 끊김 · 추가 편집이 잠겼습니다",
        });
      } else await controller.refresh();
    },
    refresh() {
      if (!refreshing)
        refreshing = refreshImpl().finally(() => (refreshing = null));
      return refreshing;
    },
    async resolveConflict(choice) {
      if (
        !state.draft ||
        !["conflict", "editing", "failed"].includes(state.status)
      )
        return;
      const epoch = ++revision;
      emit({ status: "saving" });
      try {
        const latest = await gateway.getProject(projectId);
        if (disposed || revision !== epoch) return;
        if (choice === "latest") {
          await store.remove(key, projectId);
          emit({
            snapshot: latest,
            draft: null,
            status: "saved",
            error: null,
            lastConfirmedAt: clock.now().toISOString(),
          });
          return;
        }
        const op = reapply(state.draft, latest);
        const old = state.draft;
        emit({
          snapshot: latest,
          draft: {
            ...old,
            base: latest,
            command: null,
            editedFields: fieldsFor(op),
          },
          status: "editing",
          error: null,
        });
        await controller.commit(op);
      } catch (e) {
        if (disposed || revision !== epoch) return;
        if ((e as { code?: string }).code) fail(e);
        else
          emit({
            status: "conflict",
            error: e instanceof Error ? e.message : "충돌 해결 실패",
          });
      }
    },
    dispose() {
      disposed = true;
      clock.clearInterval(timer);
      listeners.clear();
    },
  };
  const timer = clock.setInterval(() => {
    void controller.refresh();
  }, 10000);
  return controller;
}
