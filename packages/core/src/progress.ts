import type { Task, ProgressSummary } from "./model";
export function summarizeProgress(tasks: Task[]): ProgressSummary {
  const live = tasks.filter((t) => t.deletedAt === null),
    entered = live.filter((t) => t.progress !== null);
  return {
    value:
      live.length > 0 && entered.length === live.length
        ? entered.reduce((a, t) => a + t.progress!, 0) / live.length
        : null,
    entered: entered.length,
    total: live.length,
  };
}
