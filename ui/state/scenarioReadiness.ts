let current: { name: string; initialized: boolean; taskId?: string; error?: string } | undefined;
export function beginScenario(name: string, taskId?: string) { current = { name, taskId, initialized: false }; }
export function finishScenario(error?: string) { if (current) current = { ...current, initialized: !error, error }; }
export function scenarioReadiness(detail: Record<string, unknown> | null) {
  if (!current) return null;
  const detailReady = !current.taskId || detail?.id === current.taskId && !!detail.timeline;
  const ready = current.initialized && detailReady;
  return { name: current.name, ready, state: current.error ? 'failed' : ready ? 'ready' : 'opening', expectedTaskId: current.taskId, error: current.error ?? null };
}
