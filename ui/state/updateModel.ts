export type UpdateState = "idle" | "checking" | "available" | "downloading" | "settling" | "countdown" | "swapping" | "starting" | "verifying" | "resuming" | "succeeded" | "rolling-back" | "rolled-back" | "failed" | "cancelled";
export type UpdateTiming = "settled" | "now" | "defer";
export type UpdateWork = { kind: string; agent?: string; taskId?: string; turnId?: string; title?: string; owner?: string; count?: number; reason?: string; question?: unknown };
export type UpdateSnapshot = {
  id?: string;
  state: UpdateState;
  source?: { kind: "release" | "local"; version?: string; build?: string; branch?: string; landedLanes?: string[] } | null;
  instance?: string;
  work: { blocking: UpdateWork[]; willResume: UpdateWork[]; unaffected: UpdateWork[] };
  when: UpdateTiming;
  deferUntil?: string | null;
  restartAt?: string | null;
  notes?: string | null;
  error?: string | null;
  backup?: string | null;
  backupReady?: boolean;
  backupMoved?: boolean;
  statusPath?: string | null;
  logPath?: string | null;
  paths?: { source?: string; target?: string; staged?: string };
  updatedAt?: string;
  createdAt?: string;
  supported?: boolean;
  canSchedule?: boolean;
  downloaded?: number;
  total?: number;
  resumedCount?: number;
  settleDurationMs?: number;
  droppedInteractions?: number;
  recent?: UpdateSnapshot[];
};
export const idleUpdate = (): UpdateSnapshot => ({ state: "idle", when: "settled", work: { blocking: [], willResume: [], unaffected: [] } });
export const updateTerminal = (value: UpdateSnapshot) => ["succeeded", "rolled-back", "failed", "cancelled"].includes(value.state);
export const updateActive = (value: UpdateSnapshot) => !["idle", "available", "checking", "succeeded", "rolled-back", "failed", "cancelled"].includes(value.state);
export function mergeUpdateSnapshot(previous: UpdateSnapshot | undefined, next: UpdateSnapshot): UpdateSnapshot {
  if (previous?.id && next.id && previous.updatedAt && next.updatedAt && next.updatedAt < previous.updatedAt) return previous;
  return next;
}
export function updateCountdown(value: UpdateSnapshot, now: number): number | undefined {
  if (value.state !== "countdown" || !value.restartAt) return;
  const deadline = Date.parse(value.restartAt);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : undefined;
}
export function updateStep(value: UpdateSnapshot): number {
  if (value.state === "verifying") return value.backupMoved ? 4 : 0;
  return ({ idle: 0, checking: 0, available: 0, downloading: 0, settling: value.backupReady ? 2 : 1, countdown: 2, swapping: 3, starting: 3, resuming: 5, succeeded: 6, "rolling-back": 3, "rolled-back": 6, failed: 0, cancelled: 0 })[value.state];
}
export function updateBlocks(value: UpdateSnapshot, agent: string, taskId: string): boolean {
  return updateActive(value) && value.when !== "defer" && value.work.blocking.some(item => item.agent === agent && item.taskId === taskId);
}
