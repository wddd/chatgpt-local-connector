import { useState } from 'react';
import type { ProviderAccount as Account } from '../types';
import { accountsApi } from '../api';
import { t, locale } from '../i18n';
import { copyText } from '../platform';
import { refreshAccounts } from '../state/accounts';
import { Button, Dialog, Field, Input, Notice, Status } from './ui';
import { Private } from './Privacy';
export const accountDate = (value?: string) => value ? new Date(value).toLocaleString(locale.get()) : '—';
export function AccountQuota({ account }: { account: Account }) {
  return <section className="account-card"><h3>{t('accounts.quota')}</h3>{account.quota.windows.length ? account.quota.windows.map(window => <div className="account-window" key={window.id}>
    <div className="source-section-heading"><span>{window.label}</span><strong>{t('accounts.used', { percent: Math.round(window.usedPercent) })}</strong></div>
    <progress max={100} value={Math.max(0, Math.min(100, window.usedPercent))} aria-label={window.label} />
    {window.resetsAt && <span className="muted small">{t('accounts.resets', { time: accountDate(window.resetsAt) })}</span>}
  </div>) : <p className="muted">{t('accounts.noQuota')}</p>}</section>;
}
export function AccountNotifications({ account }: { account: Account }) {
  const [manual, setManual] = useState(false), [target, setTarget] = useState(''), [error, setError] = useState(''), [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false), [sent, setSent] = useState('');
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError(''); try { await work(); await refreshAccounts(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  const canNotify = account.agentProfiles.some(profile => profile.agent === 'claude') && !account.removedAt;
  return <section className="account-card">
    <div className="source-section-heading"><h3>{t('accounts.notifications')}</h3><Status tone={account.notifications.state === 'verified' ? 'success' : account.notifications.state === 'not-bound' ? 'warning' : 'neutral'}>{t(`accounts.notifications.${account.notifications.state}`)}</Status></div>
    {account.notifications.state === 'mcp-events' && <p role="status">{t(account.notifications.reachable ? 'accounts.reachable' : 'accounts.unreachable')}</p>}
    {account.notifications.sessions.map((session, index) => <div className="account-session" key={`${session.sourceId ?? ''}:${session.target}:${index}`}>
      <Private>{session.target}</Private>
      <span className="muted small">{t('accounts.lastDelivery', { time: session.lastDelivery ? accountDate(new Date(session.lastDelivery.at * 1000).toISOString()) : '—' })}{session.lastDelivery && ` · ${session.lastDelivery.status}`}</span>
      {canNotify && session.channel !== 'mcp-events' && <Button disabled={busy} onClick={() => void action(async () => { await accountsApi.notify(account.id, 'test', { target: session.target }); setSent(session.target); })}>{t('accounts.sendTest')}</Button>}
    </div>)}
    <div className="actions account-actions">
      {account.provider === 'anthropic' && account.sources.length > 0 && <Button disabled={busy} onClick={() => void action(() => copyText(`Use whoami to confirm account ${account.id}, then use notify_control to bind this session and verify notification reachability.`))}>{t('accounts.copyBind')}</Button>}
      {canNotify && <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setManual(true); }}>{t('accounts.bindManually')}</Button>}
    </div>
    {sent && <p role="status">{t('accounts.testSent')} <Private>{sent}</Private></p>}{error && !manual && <Notice>{error}</Notice>}
    {manual && <Dialog centered title={t('accounts.bindManually')} busy={busy} onClose={() => setManual(false)} footer={<><Button onClick={() => setManual(false)} disabled={busy}>{t('cancel')}</Button><Button variant="primary" type="submit" form="account-bind" busy={busy}>{t('save')}</Button></>}>
      <form id="account-bind" onSubmit={e => { e.preventDefault(); if (!target.trim()) { setFieldError(t('fieldRequired')); document.getElementById('account-bind-target')?.focus(); return; } void action(async () => { await accountsApi.route({ accountId: account.id, target: target.trim() }); setManual(false); }); }}>
        <p>{t('accounts.bindConsequence')}</p>
        <Field id="account-bind-target" label={t('claudeAccounts.target')} error={fieldError}><Input data-sensitive id="account-bind-target" autoComplete="off" value={target} disabled={busy} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'account-bind-target-error' : undefined} onChange={e => { setTarget(e.target.value); setFieldError(''); }} /></Field>
        {error && <Notice>{error}</Notice>}
      </form>
    </Dialog>}
  </section>;
}
