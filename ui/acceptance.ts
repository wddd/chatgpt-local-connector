// On-demand observation of the real renderer. No alternate layout or state model.
import { agentPanel, ingressPanel, selectAgentPanel, selectIngressPanel } from './state/overviewPanels';
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
  return {
    schemaVersion: 1, layoutSettled, capturedAt: new Date().toISOString(),
    window: { width: innerWidth, height: innerHeight, devicePixelRatio },
    theme: document.documentElement.dataset.theme, language: locale.get(),
    topology: topology?.() ?? null,
    panels: { agent: agentPanel.get() ?? null, source: ingressPanel.get()?.ingress.id ?? null,
      onboarding: onboarding.get()?.step ?? null, page: localStorage.getItem('arc-page') ?? 'overview' },
  };
}
export type PanelRequest = { kind: 'agent' | 'source' | 'none'; id?: string };
export function openSnapshotPanel(panel?: PanelRequest | null) {
  if (!panel) return;
  onboarding.set(undefined);
  if (panel.kind === 'none') { agentPanel.set(undefined); ingressPanel.set(undefined); return; }
  if (panel.kind === 'agent') {
    if (!agents.get().items.some(a => a.agent === panel.id)) throw new Error('SNAPSHOT_NODE_NOT_FOUND: agent');
    selectAgentPanel({ type: 'agent', agent: panel.id! });
  } else {
    const source = connector.get().status?.ingresses.find(s => s.id === panel.id);
    if (!source) throw new Error('SNAPSHOT_NODE_NOT_FOUND: source');
    selectIngressPanel(source);
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
    if (current && current === previous) stable++; else stable = 0;
    if (stable >= 3) return viewModel(true);
    previous = current ?? '';
  }
  return { ...viewModel(), layoutSettled: false };
}
export async function captureRequest(request: { id: string; panel?: PanelRequest }, navigate: () => void) {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    await Promise.all([refreshConnector(), refreshAgents(), refreshTasks(), api<AgentActivitySnapshot>('agents/activity').then(acceptActivity)]);
    if (request.panel) { navigate(); openSnapshotPanel(request.panel); }
    const model = await settledViewModel();
    await invoke('snapshot_ready', { id: request.id, model, error: null });
  } catch (error) { await invoke('snapshot_ready', { id: request.id, model: null, error: String(error) }); }
}
// Read-only accessor also used by browser acceptance screenshots.
Object.assign(window, { __ARC_VIEW_MODEL__: viewModel });
