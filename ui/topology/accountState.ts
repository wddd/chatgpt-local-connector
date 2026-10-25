import { useEffect, useState } from 'react';
import { accountsApi } from '../api';
import { preference } from '../state/store';
import type { ProviderAccount } from '../types';

export const topologyMode = preference<'tree' | 'flat'>('arc.topology-mode', 'tree', raw => JSON.parse(raw) === 'flat' ? 'flat' : 'tree');
export const topologyCollapsed = preference<Record<string, boolean>>('arc.topology-collapsed', {}, raw => {
  const value = JSON.parse(raw);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, collapsed]) => typeof collapsed === 'boolean')) as Record<string, boolean> : {};
});
export const topologyAccountOrder = preference<Record<string, string[]>>('arc.topology-account-order', {}, raw => {
  const value = JSON.parse(raw);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every(id => typeof id === 'string'))) : {};
});

export function useTopologyAccounts(revision: unknown) {
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  useEffect(() => {
    let active = true;
    void accountsApi.list().then(result => {
      if (active && Array.isArray(result.accounts)) setAccounts(result.accounts);
    }).catch(() => { /* Keep the last complete snapshot if a refresh fails. */ });
    return () => { active = false; };
  }, [revision]);
  const quotaIds = JSON.stringify(accounts.filter(account => account.quotaProviderId || account.agentProfiles.some(profile => ['claude', 'codex'].includes(profile.agent))).map(account => account.id).sort());
  useEffect(() => {
    const ids = JSON.parse(quotaIds) as string[];
    if (!ids.length) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const rows = await Promise.all(ids.map(id => accountsApi.get(id).catch(() => undefined)));
      if (!active) return;
      const quotas = new Map(rows.filter(row => row !== undefined).map(row => [row.id, row.quota]));
      setAccounts(old => old.map(account => quotas.has(account.id) ? { ...account, quota: quotas.get(account.id)! } : account));
      // Account details own profile quota reads and cache them for three minutes.
      timer = setTimeout(() => void refresh(), 180000);
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [quotaIds]);
  return accounts;
}
