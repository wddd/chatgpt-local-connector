import { createStore } from "./store";
import { agentPanel, ingressPanel } from "./overviewPanels";
export type OnboardingStep = "welcome" | "product" | "connection" | "address" | "approval";
export const onboarding = createStore<{ step: OnboardingStep; method?: "create" | "join"; source?: string; localTarget?: "code" | "desktop"; ingressId?: string; requestId?: string; baseline?: string[] } | undefined>(undefined);
export function openOnboarding(step: OnboardingStep = "product", method?: "create" | "join") {
  agentPanel.set(undefined); ingressPanel.set(undefined); onboarding.set({ step, method });
}
