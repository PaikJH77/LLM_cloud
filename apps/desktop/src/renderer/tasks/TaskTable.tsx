import { useEffect, useRef, useState } from "react";
import type {
  Snapshot,
  Operation,
  DraftFields,
  Task,
} from "../../../../../packages/core/src/model";
import {
  addDays,
  dateNumber,
  todayKorea,
} from "../../../../../packages/core/src/dates";
import { axisDate } from "./gantt-geometry";
import { GanttChart } from "./GanttChart";
export function TaskTable({
  snapshot,
  draft,
  disabled,
  onEdit,
  onCommit,
}: {
  snapshot: Snapshot;
  draft: DraftFields | null;
  disabled: boolean;
  onEdit: (fields: DraftFields) => Promise<void>;
  onCommit: (op: Operation) => Promise<void>;
}) {
  const [scale, setScale] = useState("day"),
    [nameWidth, setNameWidth] = useState(180),
    [split, setSplit] = useState(670),
    [selected, setSelected] = useState(""),
    [today, setToday] = useState(() => todayKorea(new Date()));
  const composing = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayKorea(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);
  const live = snapshot.tasks
      .filter((t) => !t.deletedAt)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    dated = live.filter((t) => t.start && t.end);
  const origin = axisDate(
    dated.length
      ? dated.reduce((d, t) => (t.start! < d ? t.start! : d), dated[0].start!)
      : today,
    -3,
  );
  const last = dated.length
    ? dated.reduce((d, t) => (t.end! > d ? t.end! : d), dated[0].end!)
    : addDays(today, 30);
  const days = Math.max(35, dateNumber(last) - dateNumber(origin) + 8),
    dayWidth = scale === "day" ? 32 : 12,
    chartWidth = days * dayWidth;
  const ticks = Array.from(
    { length: Math.min(200, Math.ceil(days / (scale === "day" ? 1 : 7))) },
    (_, i) => i * (scale === "day" ? 1 : 7),
  );
  const fields = (t: Task) =>
    draft?.kind === "task" && draft.taskId === t.id
      ? draft
      : {
          kind: "task" as const,
          taskId: t.id,
          name: t.name,
          start: t.start ?? "",
          end: t.end ?? "",
          progress: t.progress === null ? "" : String(t.progress),
        };
  const save = (t: Task) => {
    if (composing.current || disabled) return;
    const f = fields(t);
    if (
      f.name === t.name &&
      f.start === (t.start ?? "") &&
      f.end === (t.end ?? "") &&
      f.progress === (t.progress === null ? "" : String(t.progress))
    )
      return;
    void onCommit({
      type: "updateTask",
      taskId: t.id,
      fields: {
        name: f.name,
        start: f.start || null,
        end: f.end || null,
        progress: f.progress === "" ? null : Number(f.progress),
      },
    });
  };
  const patch = (t: Task, key: string, value: string) => {
    void onEdit({ ...fields(t), [key]: value }).catch(() => {});
  };
  const reorder = (index: number, delta: number) => {
    const ids = live.map((t) => t.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void onCommit({ type: "reorderTasks", taskIds: ids });
  };
  const gridStyle = {
    gridTemplateColumns: `${nameWidth}px 135px 135px 90px ${Math.max(110, split - nameWidth - 360)}px ${chartWidth}px`,
  };
  return (
    <section className="card timeline">
      <div className="toolbar">
        <label>
          시간축{" "}
          <select
            aria-label="시간축"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
          >
            <option value="day">일</option>
            <option value="week">주</option>
          </select>
        </label>
        <label>
          작업명 열 너비{" "}
          <input
            aria-label="작업명 열 너비"
            type="range"
            min="120"
            max="320"
            value={nameWidth}
            onChange={(e) => setNameWidth(Number(e.target.value))}
          />
        </label>
        <label>
          표 / 차트 비율{" "}
          <input
            aria-label="표와 차트 비율"
            type="range"
            min="600"
            max="1000"
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
          />
        </label>
        <small>화살표 키로 하루 이동 · Esc로 드래그 취소</small>
      </div>
      <div
        className="timeline-scroll"
        role="region"
        aria-label="작업 표와 간트 차트"
        tabIndex={0}
      >
        <div className="task-grid grid-header" style={gridStyle}>
          <span>작업명</span>
          <span>시작일</span>
          <span>종료일</span>
          <span>진행률</span>
          <span>작업 관리</span>
          <div className="axis">
            {ticks.map((i) => (
              <span key={i} style={{ left: i * dayWidth }}>
                {axisDate(origin, i).slice(5)}
              </span>
            ))}
          </div>
        </div>
        {live.map((t, index) => {
          const f = fields(t),
            rowDisabled =
              disabled || (draft?.kind === "task" && draft.taskId !== t.id);
          return (
            <div
              key={t.id}
              className={
                "task-grid task-row " + (selected === t.id ? "selected" : "")
              }
              style={gridStyle}
              onFocus={() => setSelected(t.id)}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={() => (composing.current = false)}
            >
              <input
                aria-label={t.name + " 작업명"}
                value={f.name}
                disabled={rowDisabled}
                onChange={(e) => patch(t, "name", e.target.value)}
                onBlur={() => save(t)}
              />
              <input
                aria-label={t.name + " 시작일"}
                type="date"
                value={f.start}
                disabled={rowDisabled}
                onChange={(e) => patch(t, "start", e.target.value)}
                onBlur={() => save(t)}
              />
              <input
                aria-label={t.name + " 종료일"}
                type="date"
                value={f.end}
                disabled={rowDisabled}
                onChange={(e) => patch(t, "end", e.target.value)}
                onBlur={() => save(t)}
              />
              <div>
                <input
                  aria-label={t.name + " 진행률"}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={f.progress}
                  disabled={rowDisabled}
                  onChange={(e) => patch(t, "progress", e.target.value)}
                  onBlur={() => save(t)}
                />
                <small>
                  {f.progress === ""
                    ? "미입력"
                    : f.progress === "0"
                      ? "시작 전"
                      : f.progress === "100"
                        ? "완료"
                        : f.progress + "%"}
                </small>
              </div>
              <div className="row-actions">
                <button
                  aria-label={t.name + " 위로"}
                  disabled={rowDisabled || !!draft || index === 0}
                  onClick={() => reorder(index, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={t.name + " 아래로"}
                  disabled={rowDisabled || !!draft || index === live.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  ↓
                </button>
                <button
                  disabled={rowDisabled || !!draft}
                  aria-label={t.name + " 삭제"}
                  onClick={() => {
                    if (confirm(`작업 “${t.name}”을 휴지통으로 이동할까요?`))
                      void onCommit({ type: "trashTask", taskId: t.id });
                  }}
                >
                  삭제
                </button>
              </div>
              <div
                className="chart-cell"
                style={{ backgroundSize: dayWidth + "px 100%" }}
              >
                <GanttChart
                  snapshot={{ ...snapshot, tasks: [t] }}
                  onCommit={onCommit}
                  disabled={rowDisabled || !!draft}
                  origin={origin}
                  dayWidth={dayWidth}
                />
                {[
                  { date: today, label: "오늘", className: "today-line" },
                  {
                    date: snapshot.project.deadline,
                    label: "마감",
                    className: "deadline-line",
                  },
                ]
                  .filter(
                    (m) =>
                      m.date &&
                      dateNumber(m.date) >= dateNumber(origin) &&
                      dateNumber(m.date) <= dateNumber(last) + 7,
                  )
                  .map((m) => (
                    <div
                      key={m.label}
                      className={m.className}
                      style={{
                        left:
                          (dateNumber(m.date!) - dateNumber(origin)) * dayWidth,
                      }}
                      title={m.label + " " + m.date}
                    />
                  ))}
                {snapshot.project.deadline &&
                  t.end &&
                  t.end > snapshot.project.deadline && (
                    <span className="deadline-warning">⚠ 마감일 초과</span>
                  )}
              </div>
            </div>
          );
        })}
        {!live.length && (
          <p className="empty">작업을 추가해 일정을 시작하세요.</p>
        )}
      </div>
    </section>
  );
}
