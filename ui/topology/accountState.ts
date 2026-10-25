import { useEffect, useState } from 'react';
import { api } from '../api';
import { preference } from '../state/store';
import type { TopologyAccount } from './accounts';

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
  const [accounts, setAccounts] = useState<TopologyAccount[]>([]);
  useEffect(() => {
    let active = true;
    void api<{ accounts: TopologyAccount[] }>('accounts').then(result => {
      if (active && Array.isArray(result.accounts)) setAccounts(result.accounts);
    }).catch(() => { /* Older Core has no accounts endpoint; retain the legacy graph. */ });
    return () => { active = false; };
  }, [revision]);
  return accounts;
}
