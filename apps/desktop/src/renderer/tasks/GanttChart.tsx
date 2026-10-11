import { useEffect, useRef, useState } from "react";
import type {
  Snapshot,
  Operation,
  Task,
} from "../../../../../packages/core/src/model";
import {
  dateNumber,
  inclusiveDays,
} from "../../../../../packages/core/src/dates";
import { moveRange, resizeRange, type DateRange } from "./gantt-geometry";
export function GanttChart({
  snapshot,
  onCommit,
  disabled = false,
  origin,
  dayWidth = 32,
}: {
  snapshot: Snapshot;
  onCommit: (op: Operation) => Promise<void>;
  disabled?: boolean;
  origin?: string;
  dayWidth?: number;
}) {
  const task = snapshot.tasks[0],
    start = origin ?? task?.start ?? "2026-01-01";
  const [preview, setPreview] = useState<DateRange | null>(null),
    [error, setError] = useState("");
  const drag = useRef<{
    x: number;
    version: number;
    kind: "move" | "start" | "end";
    task: Task;
    range: DateRange | null;
  } | null>(null);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        drag.current = null;
        setPreview(null);
        setError("");
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  useEffect(() => {
    if (disabled) {
      drag.current = null;
      setPreview(null);
    }
  }, [disabled]);
  useEffect(() => {
    if (drag.current && drag.current.version !== snapshot.project.version) {
      drag.current = null;
      setPreview(null);
      setError("다른 PC에서 변경되어 드래그를 취소했습니다");
    }
  }, [snapshot.project.version]);
  if (!task?.start || !task.end || task.deletedAt)
    return <div className="gantt-empty">일정 미정</div>;
  const range = preview ?? { start: task.start, end: task.end },
    left = (dateNumber(range.start) - dateNumber(start)) * dayWidth,
    width = inclusiveDays(range.start, range.end) * dayWidth;
  const commit = (r: DateRange) =>
    onCommit({
      type: "updateTask",
      taskId: task.id,
      fields: {
        name: task.name,
        start: r.start,
        end: r.end,
        progress: task.progress,
      },
    });
  const events = (kind: "move" | "start" | "end") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        x: e.clientX,
        version: snapshot.project.version,
        kind,
        task,
        range: { start: task.start!, end: task.end! },
      };
      setPreview(drag.current.range);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const delta = Math.round((e.clientX - d.x) / dayWidth);
      try {
        d.range =
          d.kind === "move"
            ? moveRange(d.task.start!, d.task.end!, delta)
            : resizeRange(d.task.start!, d.task.end!, d.kind, delta);
        setPreview(d.range);
        setError("");
      } catch {
        d.range = null;
        setError("종료일은 시작일 이후여야 합니다");
      }
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      setPreview(null);
      if (d && d.version !== snapshot.project.version) {
        setError("다른 PC에서 변경되어 드래그를 취소했습니다");
        return;
      }
      if (
        d?.range &&
        (d.range.start !== task.start || d.range.end !== task.end)
      )
        void commit(d.range);
    },
    onPointerCancel: () => {
      drag.current = null;
      setPreview(null);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (disabled || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      try {
        void commit(
          kind === "move"
            ? moveRange(task.start!, task.end!, e.key === "ArrowRight" ? 1 : -1)
            : resizeRange(
                task.start!,
                task.end!,
                kind,
                e.key === "ArrowRight" ? 1 : -1,
              ),
        );
      } catch {
        setError("종료일은 시작일 이후여야 합니다");
      }
    },
  });
  return (
    <div className="gantt-track">
      <div className="gantt-bar" style={{ left, width }}>
        <button
          className="bar-move"
          aria-label={task.name + " 막대 이동"}
          disabled={disabled}
          {...events("move")}
        >
          <i style={{ width: (task.progress ?? 0) + "%" }} />
          <span>{task.name}</span>
        </button>
        <button
          className="bar-edge start"
          aria-label={task.name + " 시작일 조절"}
          disabled={disabled}
          {...events("start")}
        />
        <button
          className="bar-edge end"
          aria-label={task.name + " 종료일 조절"}
          disabled={disabled}
          {...events("end")}
        />
      </div>
      {preview && (
        <output className="drag-preview" style={{ left }}>
          {preview.start} ~ {preview.end}
        </output>
      )}
      {error && (
        <span role="alert" className="error-text">
          {error}
        </span>
      )}
    </div>
  );
}
