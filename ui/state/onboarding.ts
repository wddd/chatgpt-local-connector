import { createStore } from "./store";
import { agentPanel, ingressPanel } from "./overviewPanels";
export type OnboardingStep = "welcome" | "product" | "connection" | "address" | "approval" | "success";
export const onboarding = createStore<{ step: OnboardingStep; source?: string; localTarget?: "code" | "desktop"; ingressId?: string; requestId?: string; sourceId?: string; baseline?: string[] } | undefined>(undefined);
export type ConnectionSetup = { method?: "create" | "join"; forSource?: boolean; product?: string; localTarget?: "code" | "desktop" };
export const connectionSetup = createStore<ConnectionSetup | undefined>(undefined);
export function openOnboarding(step: OnboardingStep = "product") {
  connectionSetup.set(undefined);
  agentPanel.set(undefined); ingressPanel.set(undefined); onboarding.set({ step });
}
export function openConnectionSetup(options: ConnectionSetup = {}) {
  if (!options.forSource) onboarding.set(undefined);
  agentPanel.set(undefined); ingressPanel.set(undefined); connectionSetup.set(options);
}
