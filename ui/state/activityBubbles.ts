import { createStore } from "./store";
import type { TrackedActivity } from "./activityModel";

// Renderer-scoped state shared by topology controls and agent operations.
export const trackedActivity = createStore<Record<string, TrackedActivity[]>>({});
const reads = new Map<string, { agent: string; id: string; readAt: number }>();
const key = (agent: string, id: string) => JSON.stringify([agent, id]);
export function resetActivityBubbles() { reads.clear(); trackedActivity.set({}); }
export function forgetActivityRead(agent: string, id: string) { reads.delete(key(agent, id)); }
export function rememberActivityRead(agent: string, id: string, readAt: number) { reads.set(key(agent, id), { agent, id, readAt }); }
export function activityBubbleSnapshot() {
  const current = Object.entries(trackedActivity.get()).flatMap(([agent, sessions]) => sessions.map(session => ({
    agent, id: session.id, completed: session.endedAt !== undefined, unread: session.endedAt !== undefined && session.readAt === undefined,
    readAt: session.readAt ?? null, retained: true,
  })));
  const keys = new Set(current.map(row => key(row.agent, row.id)));
  return [...current, ...[...reads.values()].filter(row => !keys.has(key(row.agent, row.id)))
    .map(row => ({ ...row, completed: true, unread: false, retained: false }))];
}
export interface ActivityBubbleRequest { agent: string; id: string; action?: "mark-read" }
export function controlActivityBubble(request: ActivityBubbleRequest) {
  if (request.action !== undefined && request.action !== "mark-read") throw new Error("TASK_BUBBLE_ACTION_UNSUPPORTED: use task_mark_read to mark a completed bubble read");
  const current = () => activityBubbleSnapshot().find(row => row.agent === request.agent && row.id === request.id);
  const bubble = current();
  if (!bubble) throw new Error("TASK_BUBBLE_NOT_FOUND: read app.snapshot model.taskBubbles for current renderer task IDs");
  if (request.action === "mark-read") {
    if (!bubble.completed) throw new Error("TASK_BUBBLE_ACTIVE: only completed bubbles can be marked read; read task_bubble again after completion");
    if (bubble.unread) {
      rememberActivityRead(request.agent, request.id, Date.now());
      trackedActivity.set(old => ({ ...old, [request.agent]: (old[request.agent] ?? []).filter(session => session.id !== request.id) }));
    }
  }
  return current()!;
}
