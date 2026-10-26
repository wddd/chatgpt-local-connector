import { onboarding, connectionSetup } from "./onboarding";
import { createStore } from "./store";
import { agentPanelSelection, type AgentPanelSelection, type AgentPanelAction } from "./activityModel";
import { accounts } from "./accounts";
import { connector } from "./connector";
import { isLocalSource, isPendingSource } from "../sourcePresentation";

export const agentPanel = createStore<AgentPanelSelection>(undefined);
export type SrcPanelSelection = { platform: string; sourceId?: string; closing?: boolean };
export const srcPanel = createStore<SrcPanelSelection | undefined>(undefined);
export function selectAgentPanel(action: AgentPanelAction) {
  connectionSetup.set(undefined);
  onboarding.set(undefined);
  if (["agent", "platform", "toggle", "task"].includes(action.type)) srcPanel.set(undefined);
  if ((action.type === "agent" || action.type === "toggle") && !action.accountId) {
    const agent = action.agent;
    const candidates = accounts.get().items.filter(account => account.agentProfiles.some(profile => profile.agent === agent));
    if (candidates.length === 1) action = { ...action, accountId: candidates[0].id };
  }
  agentPanel.set(old => agentPanelSelection(old, action));
}
export function selectSourcePanel(platform: string, options: { sourceId?: string; platformOnly?: boolean; toggle?: boolean } = {}) {
  connectionSetup.set(undefined);
  onboarding.set(undefined);
  agentPanel.set(undefined);
  const { sources, status } = connector.get();
  const candidates = sources.filter(source => source.product === platform && !isLocalSource(source) && !isPendingSource(source, status?.ingresses ?? []) && source.state !== "revoked");
  const identities = new Set(candidates.map(source => accounts.get().items.find(account => account.sources.includes(source.id))?.id ?? source.id));
  const sourceId = options.sourceId ?? (!options.platformOnly && identities.size === 1 ? candidates[0]?.id : undefined);
  srcPanel.set(old => options.toggle && old?.platform === platform && old.sourceId === sourceId
    ? { ...old, closing: true } : { platform, sourceId });
}
