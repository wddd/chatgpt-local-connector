import type { ProviderAccount } from "../types";
import type { ProviderSnapshot } from "./types";
import { isWeekly } from "./labels";

export function accountQuotaProvider(agent: string, quota: ProviderAccount["quota"]): ProviderSnapshot {
  const raw = quota.error;
  const message = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && 'message' in raw && typeof raw.message === 'string' ? raw.message : undefined;
  return {
    providerId: agent, agentId: agent, agentIds: [agent], name: agent, eligible: true,
    state: quota.error ? "unavailable" : quota.state, refreshing: false,
    windows: quota.windows, observedAt: quota.observedAt,
    displayWindowId: quota.windows.find(window => isWeekly(window.label))?.id ?? quota.windows[0]?.id,
    accountBlocked: quota.accountBlocked ?? undefined, blockedPoolIds: quota.blockedPoolIds ?? [],
    error: raw ? { code: 'account-quota-error', message: message ?? '' } : undefined,
    hasCredential: false, acceptsKey: false,
  };
}
