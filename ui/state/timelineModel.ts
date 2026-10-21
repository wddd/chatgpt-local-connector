import type { AgentTimeline } from "../types.ts";

export function mergeTimeline(current: AgentTimeline | undefined, next: AgentTimeline): AgentTimeline {
  if (!current || current.sessionId !== next.sessionId) return next;
  const entries = new Map(current.entries.map(entry => [entry.id, entry]));
  for (const entry of next.entries) entries.set(entry.id, entry);
  return { ...next, entries: [...entries.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) };
}
export async function refreshTimeline(current: AgentTimeline | undefined, read: (after?: number) => Promise<AgentTimeline>) {
  try { return mergeTimeline(current, await read(current?.cursor)); }
  catch (error) {
    if (!String(error).includes("TIMELINE_CURSOR_EXPIRED")) throw error;
    return read();
  }
}
export function followsTimeline(scrollTop: number, clientHeight: number, scrollHeight: number, previousTop = scrollTop) {
  return scrollTop >= previousTop && scrollHeight - scrollTop - clientHeight <= 24;
}
export function timelineScrollTarget(following: boolean, running: boolean, initial: boolean, scrollHeight: number) {
  return following && (running || initial) ? scrollHeight : undefined;
}
