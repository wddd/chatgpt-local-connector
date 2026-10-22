import type { AgentActivitySession } from "../types";
import type { TaskRecord, TaskRuntime } from "./tasks";

export function sourceDispatches(records: TaskRecord[], sourceId: string) {
  return records.filter(r => (r.origin?.sourceId ?? r.task.origin?.sourceId) === sourceId && ["create", "send"].includes(r.task.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
// A newer dispatch (including one from another source) owns the thread's live state.
export function isLatestDispatch(record: TaskRecord, records: TaskRecord[]) {
  const id = record.threadId || record.task.threadId;
  return !!id && !records.some(other => ["create", "send"].includes(other.task.kind)
    && (other.threadId || other.task.threadId) === id && other.createdAt > record.createdAt);
}

export function dispatchState(record: TaskRecord, runtime: TaskRuntime | undefined, session: AgentActivitySession | undefined) {
  if (session) return session.interaction ? "pending" : "running";
  if (record.error || ["failed", "rejected", "not-executed"].includes(record.state)) return "failed";
  if (record.state === "awaiting-approval") return "pending";
  if (!runtime || runtime.stale) return "unknown";
  return ({ active: "running", waiting: "pending", idle: "completed", systemError: "failed" } as const)[runtime.runtimeStatus as "active" | "waiting" | "idle" | "systemError"] ?? "unknown";
}
