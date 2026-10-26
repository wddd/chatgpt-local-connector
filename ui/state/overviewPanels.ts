import { onboarding, connectionSetup } from "./onboarding";
import { createStore } from "./store";
import { agentPanelSelection, type AgentPanelSelection, type AgentPanelAction } from "./activityModel";
import type { Ingress } from "./types";

export const agentPanel = createStore<AgentPanelSelection>(undefined);
export type SrcPanelSelection = { client?: { id: string; name: string; source: string }; ingress: Ingress; closing?: boolean };
export const ingressPanel = createStore<SrcPanelSelection | undefined>(undefined);
export function selectAgentPanel(action: AgentPanelAction) {
  connectionSetup.set(undefined);
  onboarding.set(undefined);
  if (["agent", "toggle", "task"].includes(action.type)) ingressPanel.set(undefined);
  agentPanel.set(old => agentPanelSelection(old, action));
}
export function selectIngressPanel(ingress: Ingress, options: { client?: SrcPanelSelection["client"]; toggle?: boolean } = {}) {
  connectionSetup.set(undefined);
  onboarding.set(undefined);
  agentPanel.set(undefined);
  ingressPanel.set(old => options.toggle && old?.ingress.id === ingress.id && old?.client?.id === options.client?.id
    ? { ...old, closing: true }
    : { ingress, client: options.client ?? (old?.ingress.id === ingress.id ? old.client : undefined) });
}
