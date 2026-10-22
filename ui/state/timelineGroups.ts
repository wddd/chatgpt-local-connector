import type { AgentTimelineEntry } from "../types.ts";

export type ToolKind = "command" | "file" | "tool";
export type TimelineGroup = { id: string; tools: boolean; entries: AgentTimelineEntry[] };
export function isTimelineTool(entry: AgentTimelineEntry): entry is AgentTimelineEntry & { type: ToolKind } {
  return entry.type === "command" || entry.type === "file" || entry.type === "tool";
}
// Anchor even a single tool at its first id, so appending tools does not change identity.
export function timelineGroups(entries: readonly AgentTimelineEntry[], previous: readonly TimelineGroup[] = []): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const entry of entries) {
    const tools = isTimelineTool(entry), previous = groups.at(-1);
    if (tools && previous?.tools && previous.entries[0]!.turnId === entry.turnId) previous.entries.push(entry);
    else groups.push({ id: `${tools ? "tools" : "entry"}:${entry.id}`, tools, entries: [entry] });
  }
  // History can arrive before the current tool. Reuse the previous anchor when
  // backfilling, and give it to only one fragment if a separator splits a run.
  const assigned = new Set<TimelineGroup>();
  for (const old of previous.filter(group => group.tools)) {
    const candidates = groups.filter(group => group.tools && !assigned.has(group));
    const anchor = old.id.slice("tools:".length);
    const match = candidates.find(group => group.entries.some(entry => entry.id === anchor))
      ?? candidates.find(group => group.entries.some(entry => old.entries.some(item => item.id === entry.id)));
    if (match) { match.id = old.id; assigned.add(match); }
  }
  return groups;
}
export function entryDuration(entry: AgentTimelineEntry, now: number): number | undefined {
  const duration = entry.durationMs ?? (entry.startedAt && (entry.endedAt || entry.status === "running")
    ? (entry.endedAt ? Date.parse(entry.endedAt) : now) - Date.parse(entry.startedAt) : NaN);
  return Number.isFinite(duration) ? Math.max(0, duration) : undefined;
}
export function toolGroupState(entries: readonly AgentTimelineEntry[], now: number) {
  const durations = entries.map(entry => entryDuration(entry, now));
  return {
    running: entries.some(entry => entry.status === "running"),
    failed: entries.filter(entry => entry.status === "failed").length,
    kinds: [...new Set(entries.filter(isTimelineTool).map(entry => entry.type))].slice(0, 3),
    // Missing timing is unknown, not zero; never present a partial sum as the total.
    duration: durations.every(value => value !== undefined) ? durations.reduce((sum, value) => sum + value, 0) : undefined,
    counts: {
      read: entries.filter(entry => entry.type === "file" && entry.operation === "read").length,
      write: entries.filter(entry => entry.type === "file" && entry.operation && entry.operation !== "read").length,
      file: entries.filter(entry => entry.type === "file" && !entry.operation).length,
      command: entries.filter(entry => entry.type === "command").length,
      tool: entries.filter(entry => entry.type === "tool").length,
    },
  };
}
export function toolGroupOpen(running: boolean, manual?: boolean) { return manual ?? running; }
export function currentTimelineTool(entries: readonly AgentTimelineEntry[]) {
  return entries.filter(entry => isTimelineTool(entry) && entry.status === "running").at(-1);
}

export function currentToolPresentation(group: TimelineGroup, currentId: string | undefined, open: boolean): "none" | "inline" | "card" {
  if (!group.tools || !currentId || !group.entries.some(entry => entry.id === currentId)) return "none";
  if (group.entries.length === 1) return "inline";
  return open ? "none" : "card";
}
