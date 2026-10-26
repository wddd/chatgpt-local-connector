import { createStore } from './store';
import { fixtures } from './fixtures';
import { idleUpdate } from '../state/updateModel';
import type { AgentPanelAction } from '../state/activityModel';

export const accounts = createStore({ items: fixtures.accounts });
export const connector = createStore({ status: { ingresses: fixtures.ingresses } });
export const subscriptions = createStore({ snapshot: {
  instanceId: 'design', revision: 1,
  settings: { enabled: true, refreshMinutes: 30, agentProviders: {} }, providers: fixtures.quotaSnapshots,
} });
export const agentActivity = createStore({ snapshot: fixtures.activity });
export const updates = createStore({ snapshot: idleUpdate() });
let target: HTMLElement | undefined;
export function setActionTarget(node: HTMLElement) { target = node; }
export function action(kind: string, detail: unknown) {
  target?.dispatchEvent(new CustomEvent('arc:action', { bubbles: true, detail: { kind, value: detail } }));
}
export function selectAgentPanel(value: AgentPanelAction) { action('selectAgentPanel', value); }
export async function refreshSubscription(providerId: string) { action('refreshSubscription', providerId); }
