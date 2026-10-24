export type Update = {
  available: boolean;
  version?: string;
  notes?: string;
  date?: string;
  restarting?: boolean;
  ready?: boolean;
};
export type UpdateSnapshot = {
  revision: number;
  phase: "idle" | "checking" | "downloading" | "installing";
  update?: Update | null;
  downloaded?: number;
  total?: number | null;
  error?: string | null;
  errorStage?: "check" | "download" | "install" | null;
};
export function mergeUpdateSnapshot(previous: UpdateSnapshot | undefined, next: UpdateSnapshot): UpdateSnapshot {
  if (previous && next.revision <= previous.revision) return previous;
  // A check invalidates the previous offer. Active work never carries an old error.
  return {
    ...next,
    update: next.phase === "checking" || next.phase === "idle" && next.errorStage === "check" ? null : next.update ?? null,
    error: next.phase === "idle" ? next.error ?? null : null,
    errorStage: next.phase === "idle" ? next.errorStage ?? null : null,
  };
}
export type Replacement = {
  id?: string;
  state: string;
  error?: string;
  source?: string;
  updatedAt?: string;
  backupMoved?: boolean;
  backup?: string;
  package?: { version?: string; desktopBuild?: string };
  waiting?: { activeWrites?: number; pendingInteractions?: number; blockingTurns?: unknown[]; error?: string };
};
export const replacementActive = (value?: Replacement) => !!value && ["preparing", "awaiting-receipt", "waiting-for-turns", "verifying", "stopping", "installing", "starting", "rolling-back"].includes(value.state);
export const replacementFailed = (value?: Replacement) => !!value && ["cancelled", "failed", "rolled-back"].includes(value.state);
export function replacementForApp(value: Replacement, desktopBuild: string): Replacement {
  return value.state === "cancelled" && value.package?.desktopBuild === desktopBuild
    ? { ...value, state: "superseded" } : value;
}
export function mergeReplacement(previous: Replacement | undefined, next: Replacement): Replacement {
  return previous?.updatedAt && (!next.updatedAt || next.updatedAt < previous.updatedAt) ? previous : next;
}
