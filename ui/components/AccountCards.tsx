import { useState } from 'react';
import type { Account } from '../accounts';
import { accountApi } from '../api';
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
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError(''); try { await work(); await refreshAccounts(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  const available = account.notifications.state !== 'n/a';
  return <section className="account-card">
    <div className="source-section-heading"><h3>{t('accounts.notifications')}</h3><Status tone={account.notifications.state === 'verified' ? 'success' : account.notifications.state === 'not-bound' ? 'warning' : 'neutral'}>{t(`accounts.notifications.${account.notifications.state}`)}</Status></div>
    {account.notifications.sessions.map(session => <div className="account-session" key={session.id}><Private>{session.name}</Private><span className="muted small">{t('accounts.lastDelivery', { time: accountDate(session.lastDelivery) })}</span></div>)}
    {available && <div className="actions account-actions"><Button disabled={busy || account.notifications.state === 'not-bound' && !account.notifications.sessions.length} onClick={() => void action(async () => { await accountApi.test(account.id); setSent(true); })}>{t('accounts.sendTest')}</Button>
      <Button disabled={busy} onClick={() => void action(() => copyText(`Use whoami to confirm account ${account.id}, then use notify_control to bind this session and verify notification reachability.`))}>{t('accounts.copyBind')}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setManual(true); }}>{t('accounts.bindManually')}</Button></div>}
    {sent && <p role="status">{t('accounts.testSent')}</p>}{error && !manual && <Notice>{error}</Notice>}
    {manual && <Dialog centered title={t('accounts.bindManually')} busy={busy} onClose={() => setManual(false)} footer={<><Button onClick={() => setManual(false)} disabled={busy}>{t('cancel')}</Button><Button variant="primary" type="submit" form="account-bind" busy={busy}>{t('save')}</Button></>}>
      <form id="account-bind" onSubmit={e => { e.preventDefault(); if (!target.trim()) { setFieldError(t('fieldRequired')); document.getElementById('account-bind-target')?.focus(); return; } void action(async () => { await accountApi.bind(account.id, target.trim()); setManual(false); }); }}>
        <Field id="account-bind-target" label={t('claudeAccounts.target')} error={fieldError}><Input data-sensitive id="account-bind-target" autoComplete="off" value={target} disabled={busy} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'account-bind-target-error' : undefined} onChange={e => { setTarget(e.target.value); setFieldError(''); }} /></Field>
        {error && <Notice>{error}</Notice>}
      </form>
    </Dialog>}
  </section>;
}
