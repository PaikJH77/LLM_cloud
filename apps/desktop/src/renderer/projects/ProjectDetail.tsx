import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PlannerGateway,
  Principal,
  Operation,
  DraftFields,
} from "../../../../../packages/core/src/model";
import type { PlannerBridge } from "../../bridge";
import { createSyncController, browserClock } from "../sync/controller";
import { StatusBar } from "../sync/StatusBar";
import { ConflictDialog } from "../sync/ConflictDialog";
import { summarizeProgress } from "../../../../../packages/core/src/progress";
import { progressText } from "./ProjectList";
import { TaskTable } from "../tasks/TaskTable";
import { TrashView } from "./TrashView";
export function ProjectDetail({
  projectId,
  gateway,
  principal,
  isNew = false,
  protectedStorage = true,
  onBack = () => {},
  onExpired = () => {},
}: {
  projectId: string;
  gateway: PlannerGateway;
  principal: Principal;
  isNew?: boolean;
  protectedStorage?: boolean;
  onBack?: () => void;
  onExpired?: () => void;
}) {
  const controller = useMemo(
    () =>
      createSyncController(
        gateway,
        (gateway as PlannerBridge).drafts,
        browserClock,
        principal,
      ),
    [gateway, projectId, principal],
  );
  const [state, setState] = useState(controller.state),
    [adding, setAdding] = useState(false),
    [newTaskId, setNewTaskId] = useState(() => crypto.randomUUID());
  const composing = useRef(false);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void (isNew ? controller.openNew(projectId) : controller.open(projectId));
    const refresh = () => {
      if (document.visibilityState === "visible") void controller.refresh();
    };
    window.addEventListener("focus", refresh);
    const online = () => void controller.connectionChanged(true),
      offline = () => void controller.connectionChanged(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      unsubscribe();
      controller.dispose();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [controller]);
  useEffect(() => {
    if (state.status === "expired") onExpired();
  }, [state.status]);
  const snapshot = state.snapshot,
    p = snapshot?.project,
    connected = protectedStorage && ["saved", "editing"].includes(state.status),
    editable = connected && !p?.archivedAt && !p?.deletedAt;
  const commit = async (op: Operation) => {
    try {
      await controller.commit(op);
    } catch {}
  };
  const projectFields =
    state.draft?.editedFields.kind === "project"
      ? state.draft.editedFields
      : {
          kind: "project" as const,
          name: p?.name ?? "",
          deadline: p?.deadline ?? "",
        };
  const editProject = (patch: Partial<typeof projectFields>) =>
    void controller.edit({ ...projectFields, ...patch }).catch(() => {});
  const saveProject = () => {
    if (composing.current || !editable) return;
    void commit({
      type: p ? "updateProject" : "createProject",
      fields: {
        name: projectFields.name,
        deadline: projectFields.deadline || null,
      },
    });
  };
  const pendingTask =
    state.draft?.editedFields.kind === "task" &&
    !snapshot?.tasks.some(
      (t) => t.id === (state.draft!.editedFields as any).taskId,
    )
      ? state.draft.editedFields
      : null;
  const newFields = pendingTask ?? {
    kind: "task" as const,
    taskId: newTaskId,
    name: "",
    start: "",
    end: "",
    progress: "",
  };
  const taskForm = adding || !!pendingTask;
  const setTask = (patch: Partial<typeof newFields>) =>
    void controller.edit({ ...newFields, ...patch }).catch(() => {});
  return (
    <main className="workspace detail">
      <button className="back" onClick={onBack}>
        ← 프로젝트 목록
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">PROJECT DETAIL</span>
          <h1>{p?.name ?? "새 프로젝트"}</h1>
          <p>
            {snapshot
              ? progressText(summarizeProgress(snapshot.tasks))
              : "이름을 입력하고 프로젝트를 시작하세요."}
          </p>
        </div>
        <div className="actions">
          {p && !p.deletedAt && (
            <>
              <button
                disabled={!connected || !!state.draft || adding}
                onClick={() =>
                  void commit({
                    type: p.archivedAt ? "unarchiveProject" : "archiveProject",
                  })
                }
              >
                {p.archivedAt ? "보관 해제" : "보관"}
              </button>
              <button
                disabled={!connected || !!state.draft || adding}
                onClick={() => {
                  if (
                    confirm(
                      `프로젝트 “${p.name}” 및 살아 있는 작업 ${snapshot!.tasks.filter((t) => !t.deletedAt).length}개를 휴지통으로 이동할까요?`,
                    )
                  )
                    void commit({ type: "trashProject" });
                }}
              >
                프로젝트 삭제
              </button>
            </>
          )}
          {p?.deletedAt && (
            <button
              disabled={!connected || !!state.draft || adding}
              onClick={() => void commit({ type: "restoreProject" })}
            >
              프로젝트 복원
            </button>
          )}
        </div>
      </div>
      <StatusBar state={state} onRefresh={() => void controller.refresh()} />
      {p?.archivedAt && !p.deletedAt && (
        <p className="notice">보관된 프로젝트 · 읽기 전용</p>
      )}
      {p?.deletedAt && <p className="notice">삭제된 프로젝트 · 읽기 전용</p>}
      {state.status === "conflict" && (
        <ConflictDialog
          state={state}
          onResolve={(choice) => void controller.resolveConflict(choice)}
        />
      )}
      <form
        className="card project-fields"
        onSubmit={(e) => {
          e.preventDefault();
          saveProject();
        }}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onKeyDown={(e) => {
          if (composing.current && e.key === "Enter") e.preventDefault();
        }}
      >
        <label>
          프로젝트 이름
          <input
            aria-label="프로젝트 이름"
            disabled={
              !editable ||
              adding ||
              (!!state.draft && state.draft.editedFields.kind !== "project")
            }
            value={projectFields.name}
            onChange={(e) => editProject({ name: e.target.value })}
            onBlur={() => {
              if (p) saveProject();
            }}
          />
        </label>
        <label>
          프로젝트 마감일
          <input
            type="date"
            aria-label="프로젝트 마감일"
            disabled={
              !editable ||
              adding ||
              (!!state.draft && state.draft.editedFields.kind !== "project")
            }
            value={projectFields.deadline}
            onChange={(e) => editProject({ deadline: e.target.value })}
            onBlur={() => {
              if (p) saveProject();
            }}
          />
        </label>
        {!p && (
          <button className="primary" disabled={!editable} type="submit">
            프로젝트 만들기
          </button>
        )}
      </form>
      {snapshot && (
        <>
          <div className="section-title">
            <h2>작업과 일정</h2>
            <button
              className="primary"
              disabled={!editable || taskForm || !!state.draft}
              onClick={() => {
                setNewTaskId(crypto.randomUUID());
                setAdding(true);
              }}
            >
              작업 추가
            </button>
          </div>
          {taskForm && (
            <form
              className="card new-task"
              onSubmit={(e) => {
                e.preventDefault();
                if (composing.current) return;
                void commit({
                  type: "createTask",
                  taskId: newFields.taskId,
                  fields: {
                    name: newFields.name,
                    start: newFields.start || null,
                    end: newFields.end || null,
                    progress:
                      newFields.progress === ""
                        ? null
                        : Number(newFields.progress),
                  },
                }).then(() => {
                  if (controller.state.status === "saved") setAdding(false);
                });
              }}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={() => (composing.current = false)}
              onKeyDown={(e) => {
                if (composing.current && e.key === "Enter") e.preventDefault();
              }}
            >
              <label>
                새 작업 이름
                <input
                  aria-label="새 작업 이름"
                  disabled={!editable}
                  value={newFields.name}
                  onChange={(e) => setTask({ name: e.target.value })}
                />
              </label>
              <label>
                시작일
                <input
                  type="date"
                  aria-label="새 작업 시작일"
                  disabled={!editable}
                  value={newFields.start}
                  onChange={(e) => setTask({ start: e.target.value })}
                />
              </label>
              <label>
                종료일
                <input
                  type="date"
                  aria-label="새 작업 종료일"
                  disabled={!editable}
                  value={newFields.end}
                  onChange={(e) => setTask({ end: e.target.value })}
                />
              </label>
              <label>
                진행률
                <input
                  type="number"
                  aria-label="새 작업 진행률"
                  min="0"
                  max="100"
                  step="1"
                  disabled={!editable}
                  value={newFields.progress}
                  onChange={(e) => setTask({ progress: e.target.value })}
                />
              </label>
              <button type="submit" disabled={!editable}>
                작업 만들기
              </button>
              <button
                type="button"
                onClick={() => {
                  void controller
                    .resolveConflict("latest")
                    .then(() => setAdding(false));
                }}
              >
                변경안 취소
              </button>
            </form>
          )}
          {state.draft && !taskForm && (
            <button onClick={() => void controller.resolveConflict("latest")}>
              현재 변경안 취소
            </button>
          )}
          <TaskTable
            snapshot={snapshot}
            draft={state.draft?.editedFields ?? null}
            disabled={
              !editable ||
              taskForm ||
              state.draft?.editedFields.kind === "project"
            }
            onEdit={(fields) => controller.edit(fields)}
            onCommit={commit}
          />
          <TrashView
            snapshot={snapshot}
            onCommit={commit}
            disabled={!editable || !!state.draft || taskForm}
          />
        </>
      )}
    </main>
  );
}
