import { createStore } from "./store";
import { agentPanel, ingressPanel } from "./overviewPanels";
import { navigation } from "./navigation";
export type OnboardingStep = "welcome" | "product" | "address" | "approval" | "success";
export type SourceSetup = { deploying?: boolean; step: OnboardingStep; source?: string; ingressId?: string; requestId?: string; sourceId?: string; baseline?: string[]; focusGroup?: "local" | "remote" };
export const onboarding = createStore<SourceSetup | undefined>(undefined);
export const addedSource = createStore<string | undefined>(undefined);
export function openOnboarding(step: OnboardingStep = "product", options: Partial<SourceSetup> = {}) {
  agentPanel.set(undefined); ingressPanel.set(undefined); onboarding.set({ ...options, step });
}
export function finishSourceSetup() {
  const id = onboarding.get()?.sourceId;
  onboarding.set(undefined);
  if (id) {
    addedSource.set(id);
    navigation.set(old => ({ ...old, page: "overview" }));
  }
}
