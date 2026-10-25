let current: { name: string; initialized: boolean; taskId?: string; error?: string; missingRoutes: string[] } | undefined;
export function beginScenario(name: string, taskId?: string) {
  current = { name, taskId, initialized: false, missingRoutes: [] };
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.scenarioReady;
    delete document.documentElement.dataset.scenarioError;
  }
}
export function finishScenario(error?: string) {
  if (!current) return;
  current = { ...current, initialized: !error, error: error ?? current.error };
  if (current.error && typeof document !== 'undefined') document.documentElement.dataset.scenarioError = current.error;
}
export function missingScenarioRoute(path: string, method: string) {
  if (!current) return;
  const route = `${method} ${path}`;
  if (!current.missingRoutes.includes(route)) current.missingRoutes.push(route);
  finishScenario(`Missing fixture routes: ${current.missingRoutes.join(', ')}`);
  if (typeof document !== 'undefined') delete document.documentElement.dataset.scenarioReady;
}
export function scenarioReadiness(detail: Record<string, unknown> | null) {
  if (!current) return null;
  const detailReady = !current.taskId || detail?.id === current.taskId && !!detail.timeline;
  const ready = current.initialized && !current.error && detailReady;
  return { name: current.name, ready, state: current.error ? 'failed' : ready ? 'ready' : 'opening', expectedTaskId: current.taskId,
    error: current.error ?? null, missingRoutes: [...current.missingRoutes] };
}
