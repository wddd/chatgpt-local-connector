import { useEffect, useRef, useState } from 'react';
import { accountApi } from '../api';
import type { Account, AccountBrowser, AccountKind, AccountLogin } from '../accounts';
import { t } from '../i18n';
import { copyText } from '../platform';
import { refreshAccounts } from '../state/accounts';
import { Button, Checkbox, Dialog, Field, Input, Notice, SingleChoice } from './ui';
import { Private } from './Privacy';

export default function AddAccount({ onClose, initialLogin }: { onClose: () => void; initialLogin?: AccountLogin }) {
  const [step, setStep] = useState(initialLogin ? 1 : 0), [kind, setKind] = useState<AccountKind>('claude');
  const [login, setLogin] = useState(initialLogin), [identity, setIdentity] = useState<Account>();
  const [browsers, setBrowsers] = useState<AccountBrowser[]>([]), [browser, setBrowser] = useState('default');
  const [alias, setAlias] = useState(''), [defaults, setDefaults] = useState<string[]>([]), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldError, setFieldError] = useState('');
  const loading = useRef(false);
  const [identityRetry, setIdentityRetry] = useState(0);
  const waiting = login && ['starting', 'waiting'].includes(login.state);
  useEffect(() => { accountApi.browsers().then(data => setBrowsers(data.browsers)).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const timer = setInterval(() => {
      if (loading.current) return;
      loading.current = true;
      accountApi.login(login.loginId).then(value => { if (!stopped) { setLogin(value); setError(''); } })
        .catch(e => { if (!stopped) setError(String(e)); }).finally(() => { loading.current = false; });
    }, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [login?.loginId, waiting]);
  useEffect(() => {
    if (login?.state !== 'completed' || !login.accountId) return;
    let stopped = false;
    accountApi.get(login.accountId).then(value => {
      if (stopped) return;
      setIdentity(value); setFieldError(''); setError(''); setAlias(value.alias); setDefaults(value.agentProfiles.filter(p => p.default).map(p => p.agent)); setStep(2);
    }).catch(e => { if (!stopped) setError(String(e)); });
    return () => { stopped = true; };
  }, [login?.state, login?.accountId, identityRetry]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  function start() { void action(async () => { setLogin(await accountApi.add({ kind, ...(browser !== 'default' ? { browserId: browser } : {}) })); }); }
  function close() { void action(async () => { if (waiting) await accountApi.loginAction({ loginId: login.loginId, action: 'cancel' }); await refreshAccounts(); onClose(); }); }
  async function confirm() {
    if (!alias.trim()) { setFieldError(t('fieldRequired')); document.getElementById('account-alias')?.focus(); return; }
    if (!identity) return;
    await action(async () => {
      await accountApi.update({ id: identity.id, alias: alias.trim() });
      for (const agent of defaults) await accountApi.update({ id: identity.id, defaultFor: agent });
      await refreshAccounts(); onClose();
    });
  }
  return <Dialog centered title={t('accounts.add')} width={560} busy={busy} onClose={close}
    stepBar={<ol className="account-steps">{['type', 'signin', 'confirm'].map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined}>{index + 1} · {t(`accounts.${name}`)}</li>)}</ol>}
    footer={<><Button disabled={busy} onClick={close}>{t('cancel')}</Button>{step === 1 && !login && <Button onClick={() => setStep(0)}>{t('back')}</Button>}{step === 0 ? <Button variant="primary" onClick={() => setStep(1)}>{t('accounts.next')}</Button> : step === 2 ? <Button variant="primary" type="submit" form="account-confirm" busy={busy}>{t('accounts.confirm')}</Button> : !waiting && login?.state !== 'completed' ? <Button variant="primary" busy={busy} onClick={start}>{t(login ? 'retry' : 'accounts.signin')}</Button> : null}</>}>
    <div className="account-form">
      {step === 0 && <SingleChoice label={t('accounts.type')} value={kind} onChange={value => setKind(value as AccountKind)} options={['claude', 'codex', 'api-key', 'detect'].map(value => ({ value, label: t(`accounts.kind.${value}`) }))} />}
      {step === 1 && <>
        <SingleChoice label={t('claudeAccounts.browser')} value={browser} disabled={!!waiting || busy} onChange={setBrowser} options={[{ value: 'default', label: t('claudeAccounts.defaultBrowser') }, ...browsers.map(b => ({ value: b.id, label: b.name }))]} />
        {login && <p role="status">{t(`accounts.login.${login.state}`)}</p>}
        {login?.error && <Notice>{login.error}</Notice>}
        {login?.loginUrl && waiting && <Button onClick={() => void action(async () => copyText(login.loginUrl!))}>{t('claudeAccounts.copyLink')}</Button>}
        {waiting && <details><summary>{t('claudeAccounts.enterCode')}</summary><form className="account-form" onSubmit={e => { e.preventDefault(); if (!code.trim()) { setFieldError(t('fieldRequired')); document.getElementById('account-code')?.focus(); return; } void action(async () => { setLogin(await accountApi.loginAction({ loginId: login.loginId, action: 'code', code: code.trim() })); setCode(''); }); }}>
          <Field id="account-code" label={t('claudeAccounts.code')} error={fieldError}><Input id="account-code" value={code} autoComplete="off" disabled={busy} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'account-code-error' : undefined} onChange={e => { setCode(e.target.value); setFieldError(''); }} /></Field>
          <Button type="submit" busy={busy}>{t('submit')}</Button>
        </form></details>}
        <p className="muted">{t('accounts.agentFlow')}</p>
      </>}
      {step === 2 && identity && <form id="account-confirm" className="account-form" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <Private>{[identity.email, identity.orgName].filter(Boolean).join(' · ')}</Private>
        {login?.matchedExisting && <Notice tone="success">{t('accounts.matched')}</Notice>}
        <Field id="account-alias" label={t('accounts.alias')} error={fieldError}><Input id="account-alias" autoFocus value={alias} disabled={busy} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'account-alias-error' : undefined} onChange={e => { setAlias(e.target.value); setFieldError(''); }} /></Field>
        {identity.agentProfiles.length > 0 && <fieldset><legend>{t('accounts.useFor')}</legend>{identity.agentProfiles.map(profile => <Checkbox key={profile.profileId} checked={defaults.includes(profile.agent)} disabled={profile.default || busy} onChange={value => setDefaults(old => value ? [...old, profile.agent] : old.filter(agent => agent !== profile.agent))}>{profile.agent}</Checkbox>)}</fieldset>}
      </form>}
      {error && <Notice action={login?.state === 'completed' && !identity ? <Button onClick={() => setIdentityRetry(value => value + 1)}>{t('retry')}</Button> : undefined}>{error}</Notice>}
    </div>
  </Dialog>;
}
