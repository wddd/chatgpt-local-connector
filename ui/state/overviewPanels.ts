import { onboarding, connectionSetup } from "./onboarding";
import { createStore } from "./store";
import { agentPanelSelection, type AgentPanelSelection, type AgentPanelAction } from "./activityModel";
import { accounts } from "./accounts";
import { connector } from "./connector";
import { isLocalSource } from "../sourcePresentation";

export const agentPanel = createStore<AgentPanelSelection>(undefined);
export type IngressPanelSelection = { product: string; accountId?: string; client?: { id: string; name: string; source: string }; closing?: boolean };
export const ingressPanel = createStore<IngressPanelSelection | undefined>(undefined);
export function selectAgentPanel(action: AgentPanelAction) {
  connectionSetup.set(undefined);
  onboarding.set(undefined);
  if (["agent", "toggle", "task"].includes(action.type)) ingressPanel.set(undefined);
  if ((action.type === "agent" || action.type === "toggle") && !action.accountId) {
    const agent = action.agent;
    const items = accounts.get().items.filter(a => !a.removedAt && a.agentProfiles.some(p => p.agent === agent));
    if (items.length === 1) action = { ...action, accountId: items[0].id };
  }
  agentPanel.set(old => agentPanelSelection(old, action));
}
export function selectSourcePanel(product: string, options: { accountId?: string; sourceId?: string; toggle?: boolean; platformOnly?: boolean } = {}) {
  connectionSetup.set(undefined);
  onboarding.set(undefined);
  agentPanel.set(undefined);
  const sources = connector.get().sources.filter(s => s.product === product && !isLocalSource(s));
  const items = accounts.get().items.filter(a => !a.removedAt && a.sources.some(id => sources.some(s => s.id === id)));
  const accountId = options.accountId ?? (!options.platformOnly && items.length === 1 ? items[0].id : undefined);
  const source = sources.find(s => s.id === (options.sourceId ?? (options.platformOnly ? ingressPanel.get()?.client?.id : undefined))) ?? sources.find(s => items.find(a => a.id === accountId)?.sources.includes(s.id));
  ingressPanel.set(old => options.toggle && old?.product === product && old.accountId === accountId
    ? { ...old, closing: true }
    : { product, accountId, client: source ? { id: source.id, name: source.label, source: product } : undefined });
}
