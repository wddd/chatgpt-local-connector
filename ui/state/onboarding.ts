import { createStore } from "./store";
import { agentPanel, ingressPanel } from "./overviewPanels";
export type OnboardingStep = "welcome" | "product" | "connection" | "address" | "approval" | "success";
export type SourceSetup = { step: OnboardingStep; source?: string; localTarget?: "code" | "desktop"; ingressId?: string; requestId?: string; sourceId?: string; baseline?: string[]; focusGroup?: "local" | "remote"; fixedConnection?: boolean };
export const onboarding = createStore<SourceSetup | undefined>(undefined);
export const addedSource = createStore<string | undefined>(undefined);
export type ConnectionMethod = "create" | "join" | "https" | "openai-tunnel" | "local-code" | "local-desktop";
export type ConnectionSetup = { method?: ConnectionMethod; step?: "method" | "address" | "success"; createdId?: string; forSource?: boolean; product?: string; localTarget?: "code" | "desktop" };
export const connectionSetup = createStore<ConnectionSetup | undefined>(undefined);
export function openOnboarding(step: OnboardingStep = "product", options: Partial<SourceSetup> = {}) {
  connectionSetup.set(undefined);
  agentPanel.set(undefined); ingressPanel.set(undefined); onboarding.set({ ...options, step });
}
export function openConnectionSetup(options: ConnectionSetup = {}) {
  if (!options.forSource) onboarding.set(undefined);
  agentPanel.set(undefined); ingressPanel.set(undefined); connectionSetup.set(options);
}

export function finishSourceSetup() {
  const id = onboarding.get()?.sourceId;
  onboarding.set(undefined);
  if (id) addedSource.set(id);
}
