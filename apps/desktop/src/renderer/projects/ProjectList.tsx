import { useEffect, useState } from "react";
import type {
  PlannerGateway,
  ProjectListItem,
  ProjectListFilter,
  Draft,
} from "../../../../../packages/core/src/model";
import type { PlannerBridge } from "../../bridge";
import { principalKey } from "../../../../../packages/core/src/contracts";
export function progressText(p: {
  value: number | null;
  entered: number;
  total: number;
}) {
  return `${p.value === null ? "미산정" : `${Math.round(p.value * 10) / 10}%`} · ${p.entered}/${p.total} 입력`;
}
export function ProjectList({
  gateway,
  onSelect = () => {},
  onExpired = () => {},
  protectedStorage = true,
}: {
  gateway: PlannerGateway;
  onSelect?: (id: string, isNew?: boolean) => void;
  onExpired?: () => void;
  protectedStorage?: boolean;
}) {
  const [filter, setFilter] = useState<ProjectListFilter>({
      state: "active",
      query: "",
      sort: "updatedDesc",
    }),
    [items, setItems] = useState<ProjectListItem[]>([]),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState<string | null>(null),
    [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    let cancelled = false,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const values = await gateway.listProjects(filter);
        if (!cancelled) {
          setItems(values);
          setError("");
          setConfirmed(new Date().toLocaleTimeString("ko-KR"));
        }
        const b = gateway as PlannerBridge;
        if (b.drafts) {
          const p = await b.session();
          if (p) {
            const ds = await b.drafts.load(principalKey(p));
            if (!cancelled) setDrafts(ds);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          if ((e as any).code === "expired") onExpired();
        }
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    const refresh = () => void load();
    const offline = () => setError("연결 끊김 · 편집 잠김");
    window.addEventListener("offline", offline);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, [gateway, filter]);
  return (
    <main className="workspace">
      <div className="page-title">
        <div>
          <span className="eyebrow">MY WORKSPACE</span>
          <h1>
            {filter.state === "active"
              ? "진행 중 프로젝트"
              : filter.state === "archived"
                ? "보관 프로젝트"
                : "프로젝트 휴지통"}
          </h1>
          <p>하나의 프로젝트를 선택해 작업과 일정을 확인하세요.</p>
        </div>
        <button
          className="primary"
          disabled={!protectedStorage || !!error || !confirmed}
          onClick={() => onSelect(crypto.randomUUID(), true)}
        >
          새 프로젝트
        </button>
      </div>
      <nav aria-label="프로젝트 분류" className="tabs">
        {(["active", "archived", "trashed"] as const).map((state, i) => (
          <button
            key={state}
            aria-pressed={filter.state === state}
            onClick={() => setFilter({ ...filter, state })}
          >
            {["진행 중", "보관 목록", "휴지통"][i]}
          </button>
        ))}
      </nav>
      <div className="toolbar">
        <input
          aria-label="프로젝트 검색"
          placeholder="프로젝트 이름 검색"
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        />
        <select
          aria-label="정렬"
          value={filter.sort}
          onChange={(e) =>
            setFilter({
              ...filter,
              sort: e.target.value as ProjectListFilter["sort"],
            })
          }
        >
          <option value="updatedDesc">최근 수정순</option>
          <option value="deadlineAsc">마감일순</option>
        </select>
        <small>
          {error
            ? "⚠ " + error
            : confirmed
              ? "✓ 마지막 확인 " + confirmed
              : "확인 중…"}
        </small>
      </div>
      {drafts.length > 0 && (
        <section className="draft-banner">
          <strong>보호된 미저장 변경안</strong>
          {drafts.map((d) => (
            <button
              key={d.projectId}
              onClick={() => onSelect(d.projectId, d.base === null)}
            >
              복구:{" "}
              {d.editedFields.kind === "project"
                ? d.editedFields.name
                : (d.base?.project.name ?? "새 프로젝트")}
            </button>
          ))}
        </section>
      )}
      <div className="project-grid">
        {items.map(({ project: p, progress }) => (
          <button
            className="project-card"
            key={p.id}
            onClick={() => onSelect(p.id)}
          >
            <span className="project-icon">▦</span>
            <h2>{p.name}</h2>
            <span>{progressText(progress)}</span>
            <div className="progress-track">
              <i style={{ width: `${progress.value ?? 0}%` }} />
            </div>
            <footer>
              <span>마감 {p.deadline ?? "미정"}</span>
              <span>열기 →</span>
            </footer>
          </button>
        ))}
      </div>
      {!items.length && confirmed && (
        <div className="empty card">표시할 프로젝트가 없습니다</div>
      )}
    </main>
  );
}
