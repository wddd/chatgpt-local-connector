import { createStore } from "./store";
import type { Ingress } from "./types";
import { agentPanel, ingressPanel } from "./overviewPanels";
export type OnboardingStep = "welcome" | "local" | "remote" | "progress" | "ready" | "sources" | "connect";
export const onboarding = createStore<{ step: OnboardingStep; method?: "create" | "join"; source?: string; ingressId?: string; requestId?: string; baseline?: string[] } | undefined>(undefined);
export function openOnboarding(step: OnboardingStep = "sources", method?: "create" | "join") {
  agentPanel.set(undefined); ingressPanel.set(undefined); onboarding.set({ step, method });
}
export function remoteIngress(entries: Ingress[] = []) {
  return entries.find(i => i.transport === "relay" && i.state === "ready")
    ?? entries.find(i => i.auth === "oauth" && i.transport !== "local" && i.state === "ready");
}
export function sourceForClient(name: string) {
  const value = name.toLowerCase();
  if (/chatgpt|openai/.test(value)) return "chatgpt";
  if (/claude|anthropic/.test(value)) return "claude";
  if (/gemini|google/.test(value)) return "gemini";
  if (/grok|xai|x\.ai/.test(value)) return "grok";
  if (/copilot|microsoft/.test(value)) return "microsoft-copilot";
  return "custom";
}
