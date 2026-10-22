import { createStore } from "./store";
import { agentPanelSelection, type AgentPanelSelection, type AgentPanelAction } from "./activityModel";
import type { Ingress } from "./types";

export const agentPanel = createStore<AgentPanelSelection>(undefined);
export type IngressPanelSelection = { ingress: Ingress; editing?: boolean; field?: string; autoConnect?: boolean; closing?: boolean };
export const ingressPanel = createStore<IngressPanelSelection | undefined>(undefined);
export function selectAgentPanel(action: AgentPanelAction) {
  if (["agent", "toggle", "task"].includes(action.type)) ingressPanel.set(undefined);
  agentPanel.set(old => agentPanelSelection(old, action));
}
export function selectIngressPanel(ingress: Ingress, options: { editing?: boolean; field?: string; autoConnect?: boolean; toggle?: boolean } = {}) {
  agentPanel.set(undefined);
  ingressPanel.set(old => options.toggle && old?.ingress.id === ingress.id
    ? { ...old, closing: true }
    : { ingress, editing: options.editing, field: options.field, autoConnect: options.autoConnect });
}
