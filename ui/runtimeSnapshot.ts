import { updates } from "./state/updates";
import { appEnvironment, refreshAppEnvironment } from "./state/appEnvironment";
import { environmentModel } from "./state/appEnvModel";
import { activityBubbleSnapshot, controlActivityBubble, type ActivityBubbleRequest } from "./state/activityBubbles";
import { protectSnapshot } from "./state/privacy";
// On-demand observation of the real renderer. No alternate layout or state model.
import { taskPanelSnapshot, controlTaskPanel, type TaskPanelRequest } from "./state/taskPanel";
import { agentPanel, ingressPanel, selectAgentPanel, selectSourcePanel } from './state/overviewPanels';
import { connector, refreshConnector } from './state/connector';
import { agents, refreshAgents } from './state/agents';
import { refreshTasks } from './state/tasks';
import { acceptActivity } from './state/activity';
import { api } from './api';
import type { AgentActivitySnapshot } from './types';
import { locale } from './i18n';
import { onboarding } from './state/onboarding';

let topology: (() => unknown) | undefined;
export function observeTopology(read: () => unknown) {
  topology = read;
  return () => { if (topology === read) topology = undefined; };
}
export function viewModel(layoutSettled = false) {
  const detail = taskPanelSnapshot();
  return {
    env: environmentModel(appEnvironment.get(), Date.now(), {
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      colorScheme: document.documentElement.dataset.theme ?? "light", locale: locale.get(),
      windowWidth: innerWidth, windowHeight: innerHeight, taskPanelWidth: (detail?.width as number | undefined) ?? null,
      presence: !!detail && document.visibilityState === "visible" && document.hasFocus(),
    }),
    updates: updates.get(),
    schemaVersion: 1, layoutSettled, capturedAt: new Date().toISOString(),
    window: { width: innerWidth, height: innerHeight, devicePixelRatio },
    theme: document.documentElement.dataset.theme, language: locale.get(),
    topology: topology?.() ?? null,
    taskDetail: detail,
    taskBubbles: activityBubbleSnapshot(),
    panels: { agent: agentPanel.get() ?? null, source: ingressPanel.get()?.client?.id ?? ingressPanel.get()?.product ?? null,
      onboarding: onboarding.get()?.step ?? null, page: localStorage.getItem('arc-page') ?? 'overview' },
  };
}
export type PanelRequest = { kind: 'agent' | 'source' | 'none'; id?: string; accountId?: string; platform?: string; platformOnly?: boolean };
export function openSnapshotPanel(panel?: PanelRequest | null) {
  if (!panel) return;
  onboarding.set(undefined);
  if (panel.kind === 'none') { agentPanel.set(undefined); ingressPanel.set(undefined); return; }
  if (panel.kind === 'agent') {
    if (!agents.get().items.some(a => a.agent === panel.id)) throw new Error('SNAPSHOT_NODE_NOT_FOUND: agent');
    if (panel.platformOnly) agentPanel.set({ agent: panel.id! });
    else selectAgentPanel({ type: 'agent', agent: panel.id!, accountId: panel.accountId });
  } else {
    const source = connector.get().sources.find(s => s.id === panel.id);
    if (!source && !panel.platform) throw new Error('SNAPSHOT_NODE_NOT_FOUND: source');
    selectSourcePanel(panel.platform ?? source!.product, { sourceId: source?.id, accountId: panel.accountId, platformOnly: panel.platformOnly });
  }
}
export async function settledViewModel() {
  await document.fonts.ready;
  // Observe actual animated geometry until stable (bounded); CSS activity remains live.
  let previous = '', stable = 0;
  const deadline = performance.now() + 4000;
  while (performance.now() < deadline) {
    await new Promise(requestAnimationFrame);
    const current = JSON.stringify(topology?.());
    if (current && current === previous && !(topology?.() as { orientationPending?: boolean } | undefined)?.orientationPending) stable++; else stable = 0;
    if (stable >= 3) return viewModel(true);
    previous = current ?? '';
  }
  return { ...viewModel(), layoutSettled: false };
}
export async function captureRequest(request: { id: string; panel?: PanelRequest; taskPanel?: TaskPanelRequest; taskBubble?: ActivityBubbleRequest }, navigate: () => void) {
  protectSnapshot();
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    await refreshAppEnvironment();
    await Promise.all([refreshConnector(), refreshAgents(), refreshTasks(), api<AgentActivitySnapshot>('agents/activity').then(acceptActivity)]);
    if (request.panel) { navigate(); openSnapshotPanel(request.panel); }
    if (request.taskPanel) { if (request.taskPanel.action === "open") navigate(); await controlTaskPanel(request.taskPanel); }
    if (request.taskBubble) controlActivityBubble(request.taskBubble);
    const model = await settledViewModel();
    await invoke('snapshot_ready', { id: request.id, model, error: null });
  } catch (error) { await invoke('snapshot_ready', { id: request.id, model: null, error: String(error) }); }
}
