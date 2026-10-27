import { createStore } from "./store";
import { agentPanel, ingressPanel } from "./overviewPanels";
import { navigation } from "./navigation";
export type OnboardingStep = "welcome" | "product" | "connection" | "address" | "approval" | "success";
export type SourceSetup = { profile?: import("../controlSources").RemoteProfile; step: OnboardingStep; source?: string; localTarget?: "code" | "desktop"; ingressId?: string; requestId?: string; sourceId?: string; baseline?: string[]; focusGroup?: "local" | "remote" };
export const onboarding = createStore<SourceSetup | undefined>(undefined);
export const addedSource = createStore<string | undefined>(undefined);
export type ConnectionSetup = { forSource?: boolean; localTarget?: "code" | "desktop" };
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
  if (id) {
    addedSource.set(id);
    navigation.set(old => ({ ...old, page: "overview" }));
  }
}
