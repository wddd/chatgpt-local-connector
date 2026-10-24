import type { AgentTimelineEntry } from "../types.ts";
import { turnEntries, workState } from "./timelineGroups.ts";

export type TaskState = "running" | "needsYou" | "done" | "failed" | "interrupted" | "unknown";
export function taskState(status: string | undefined, live: boolean, pending = false): TaskState {
  if (pending) return "needsYou";
  if (live) return "running";
  if (["failed", "error"].includes(status ?? "")) return "failed";
  if (["cancelled", "interrupted", "canceled"].includes(status ?? "")) return "interrupted";
  if (["completed", "idle"].includes(status ?? "")) return "done";
  return "unknown";
}
export type ProcessRow = { kind: "tools"; id: string; entries: AgentTimelineEntry[] } | { kind: "entry"; id: string; entry: AgentTimelineEntry };
export function processRows(entries: readonly AgentTimelineEntry[]): ProcessRow[] {
  const rows: ProcessRow[] = [];
  const plan = [...entries].reverse().find(entry => entry.type === "plan");
  for (const entry of entries) {
    if (entry.type === "thinking" || entry.type === "plan" && entry !== plan) continue;
    if (["command", "file", "tool"].includes(entry.type)) {
      const last = rows.at(-1);
      if (last?.kind === "tools") last.entries.push(entry);
      else rows.push({ kind: "tools", id: entry.id, entries: [entry] });
    } else rows.push({ kind: "entry", id: entry.id, entry });
  }
  return rows;
}
export function processOpen(state: TaskState, manual?: boolean) {
  return state === "failed" || state === "interrupted" || state === "needsYou" || (manual ?? state === "running");
}
export function projectTurn(entries: readonly AgentTimelineEntry[], state: TaskState) {
  const live = state === "running" || state === "needsYou";
  const { prompt, final, work } = turnEntries(entries, live, state === "done");
  const rows = processRows(work);
  return { prompt, final, rows, plan: [...entries].reverse().find(entry => entry.type === "plan"),
    thinking: live ? [...entries].reverse().find(entry => entry.type === "thinking" && entry.text?.trim()) : undefined,
    updates: work.filter(entry => entry.type === "text").length,
    answers: work.filter(entry => entry.type === "interaction" && entry.status === "completed").length,
    actions: work.filter(entry => ["command", "file", "tool"].includes(entry.type)).length,
  };
}
export function toolCounts(entries: readonly AgentTimelineEntry[]) {
  const counts = workState(entries).counts;
  return { read: counts.read, edit: counts.write, file: counts.file, command: counts.command,
    running: entries.filter(entry => entry.type === "command" && entry.status === "running").length,
    tool: counts.tool };
}
export function changedFiles(entries: readonly AgentTimelineEntry[]) {
  const files = new Map<string, { path: string; added?: number; removed?: number }>();
  for (const entry of entries) {
    if (entry.status !== "completed") continue;
    const changes: NonNullable<AgentTimelineEntry["changes"]> = entry.changes ?? (entry.type === "file" && entry.path && entry.operation && entry.operation !== "read" ? [{ path: entry.path }] : []);
    for (const change of changes) {
      const previous = files.get(change.path);
      files.set(change.path, { path: change.path,
        added: change.added === undefined || previous && previous.added === undefined ? undefined : (previous?.added ?? 0) + change.added,
        removed: change.removed === undefined || previous && previous.removed === undefined ? undefined : (previous?.removed ?? 0) + change.removed });
    }
  }
  return [...files.values()];
}
