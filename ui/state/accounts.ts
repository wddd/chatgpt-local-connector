import { useEffect } from 'react';
import { accountApi } from '../api';
import type { Account } from '../accounts';
import { createStore } from './store';
export const accounts = createStore<{ items: Account[]; loading: boolean; error: string }>({ items: [], loading: true, error: '' });
let pending: Promise<void> | undefined;
export function refreshAccounts() {
  return pending ??= (async () => {
    try {
      const { accounts: rows } = await accountApi.list();
      const items = await Promise.all(rows.map(row => accountApi.get(row.id)));
      accounts.set({ items, loading: false, error: '' });
    } catch (error) { accounts.set(old => ({ ...old, loading: false, error: String(error) })); }
    finally { pending = undefined; }
  })();
}
export function useAccounts() {
  const state = accounts.use();
  useEffect(() => { void refreshAccounts(); const timer = setInterval(() => void refreshAccounts(), 10000); return () => clearInterval(timer); }, []);
  return state;
}
