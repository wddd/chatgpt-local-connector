import type { ProviderAccount } from "../types";
import type { ProviderSnapshot } from "./types";
import { isWeekly } from "./labels";

export function accountQuotaProvider(agent: string, quota: ProviderAccount["quota"]): ProviderSnapshot {
  return {
    providerId: agent, agentId: agent, agentIds: [agent], name: agent, eligible: true,
    state: quota.error ? "unavailable" : quota.state, refreshing: false,
    windows: quota.windows, observedAt: quota.observedAt,
    displayWindowId: quota.windows.find(window => isWeekly(window.label))?.id ?? quota.windows[0]?.id,
    accountBlocked: quota.accountBlocked ?? undefined, blockedPoolIds: quota.blockedPoolIds ?? [],
    hasCredential: false, acceptsKey: false,
  };
}
