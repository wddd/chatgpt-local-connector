import { useEffect } from 'react';
import { accountsApi } from '../api';
import type { ProviderAccount as Account, AccountLogin } from '../types';
import { createStore } from './store';
export const accounts = createStore<{ items: Account[]; login: AccountLogin | null; loading: boolean; error: string }>({ items: [], login: null, loading: true, error: '' });
let pending: Promise<void> | undefined;
export function boundNotificationSessions(account: Account) {
  return account.notifications.sessions.filter(session => session.target.trim().length > 0);
}
export function refreshAccounts() {
  return pending ??= (async () => {
    try {
      const { accounts: rows, login } = await accountsApi.list();
      const items = await Promise.all(rows.map(row => accountsApi.get(row.id)));
      accounts.set({ items: items.map(account => ({ ...account, notifications: { ...account.notifications, sessions: boundNotificationSessions(account) } })), login, loading: false, error: '' });
    } catch (error) { accounts.set(old => ({ ...old, loading: false, error: String(error) })); }
    finally { pending = undefined; }
  })();
}
export function useAccounts() {
  const state = accounts.use();
  useEffect(() => { void refreshAccounts(); const timer = setInterval(() => void refreshAccounts(), 10000); return () => clearInterval(timer); }, []);
  return state;
}

export function isUnidentified(account: Account) { return account.identityKey.includes(':unidentified:'); }
