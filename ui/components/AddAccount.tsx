import { useEffect, useRef, useState } from 'react';
import { accountsApi } from '../api';
import type { ProviderAccount, AccountLogin } from '../types';
import { t } from '../i18n';
import { copyText } from '../platform';
import { refreshAccounts } from '../state/accounts';
import { Button, Checkbox, Dialog, Field, Input, Notice, SingleChoice } from './ui';
import { Private } from './Privacy';

type Browser = Awaited<ReturnType<typeof accountsApi.browsers>>['browsers'][number];
export default function AddAccount({ onClose, initialLogin }: { onClose: () => void; initialLogin?: AccountLogin }) {
  const [step, setStep] = useState(initialLogin ? 1 : 0), [kind, setKind] = useState<AccountLogin['kind']>(initialLogin?.kind ?? 'claude');
  const [login, setLogin] = useState(initialLogin), [identity, setIdentity] = useState<ProviderAccount>();
  const [detected, setDetected] = useState<ProviderAccount[]>([]), [detectedId, setDetectedId] = useState('');
  const [browsers, setBrowsers] = useState<Browser[]>([]), [browser, setBrowser] = useState(initialLogin?.browserId ?? 'default');
  const [alias, setAlias] = useState(''), [defaults, setDefaults] = useState<string[]>([]), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldError, setFieldError] = useState('');
  const [identityRetry, setIdentityRetry] = useState(0);
  const loading = useRef(false);
  const waiting = !!login && ['starting', 'waiting'].includes(login.state);
  const loginKind = login?.kind ?? kind;
  useEffect(() => { accountsApi.browsers().then(data => setBrowsers(data.browsers)).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    if (!waiting || !login) return;
    let stopped = false;
    const timer = setInterval(() => {
      if (loading.current) return;
      loading.current = true;
      accountsApi.list().then(({ login: next }) => {
        if (stopped) return;
        if (!next || next.loginId !== login.loginId) { setError(t('accounts.loginChanged')); return; }
        setLogin(next); setError('');
      }).catch(e => { if (!stopped) setError(String(e)); }).finally(() => { loading.current = false; });
    }, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [login?.loginId, waiting]);
  useEffect(() => {
    if (login?.state !== 'completed') return;
    let stopped = false;
    async function read() {
      const id = login!.accountId ?? detectedId;
      if (!id) {
        const result = await accountsApi.list();
        if (stopped) return;
        // Detection can discover several native profiles; it does not choose an identity.
        setDetected(result.accounts.filter(account => account.agentProfiles.length > 0)); setStep(2); return;
      }
      const value = await accountsApi.get(id);
      if (stopped) return;
      setIdentity(value); setAlias(value.alias); setDefaults(value.agentProfiles.filter(p => p.default).map(p => p.agent));
      setFieldError(''); setError(''); setStep(2);
    }
    void read().catch(e => { if (!stopped) setError(String(e)); });
    return () => { stopped = true; };
  }, [login?.state, login?.accountId, detectedId, identityRetry]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  function start(nextKind = kind) { void action(async () => {
    setIdentity(undefined); setDetected([]); setDetectedId(''); setCode(''); setFieldError(''); setStep(1); setKind(nextKind);
    setLogin(await accountsApi.add({ kind: nextKind, ...(browser !== 'default' ? { browserId: browser } : {}) }));
  }); }
  function close() { void action(async () => { if (waiting && login) await accountsApi.login({ loginId: login.loginId, action: 'cancel' }); await refreshAccounts(); onClose(); }); }
  async function confirm() {
    if (!identity) return;
    if (!alias.trim()) { setFieldError(t('fieldRequired')); document.getElementById('account-alias')?.focus(); return; }
    await action(async () => {
      await accountsApi.update({ id: identity.id, alias: alias.trim() });
      for (const agent of defaults) await accountsApi.update({ id: identity.id, defaultFor: agent });
      await refreshAccounts(); onClose();
    });
  }
  return <Dialog centered title={t('accounts.add')} width={560} busy={busy} onClose={close}
    stepBar={<ol className="account-steps">{['type', 'signin', 'confirm'].map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined}>{index + 1} · {t(`accounts.${name}`)}</li>)}</ol>}
    footer={<><Button disabled={busy} onClick={close}>{t(waiting ? 'cancel' : 'close')}</Button>{step === 1 && !login && <Button onClick={() => setStep(0)}>{t('back')}</Button>}
      {step === 0 ? <Button variant="primary" onClick={() => setStep(1)}>{t('accounts.next')}</Button> : step === 2 ? identity && <Button variant="primary" type="submit" form="account-confirm" busy={busy}>{t('accounts.confirm')}</Button>
        : login?.state === 'unfinished' ? <Button busy={busy} onClick={() => start('detect')}>{t('accounts.kind.detect')}</Button>
        : !waiting && login?.state !== 'completed' ? <Button variant="primary" busy={busy} onClick={() => start()}>{t(login ? 'retry' : 'accounts.signin')}</Button> : null}</>}>
    <div className="account-form">
      {step === 0 && <SingleChoice label={t('accounts.type')} value={kind} onChange={value => setKind(value as AccountLogin['kind'])} options={['claude', 'codex', 'api-key', 'detect'].map(value => ({ value, label: t(`accounts.kind.${value}`) }))} />}
      {step === 1 && <>
        {['claude', 'codex'].includes(loginKind) && <SingleChoice label={t('claudeAccounts.browser')} value={browser} disabled={waiting || busy} onChange={setBrowser} options={[{ value: 'default', label: t('claudeAccounts.defaultBrowser') }, ...browsers.map(b => ({ value: b.id, label: b.name }))]} />}
        {login && <p role="status">{t(`accounts.login.${login.state}`)}</p>}
        {login?.loginUrl && waiting && <Button onClick={() => void action(async () => copyText(login.loginUrl!))}>{t('claudeAccounts.copyLink')}</Button>}
        {waiting && login?.kind === 'claude' && <details><summary>{t('claudeAccounts.enterCode')}</summary><form className="account-form" onSubmit={e => { e.preventDefault(); if (!code.trim()) { setFieldError(t('fieldRequired')); document.getElementById('account-code')?.focus(); return; } void action(async () => {
          const result = await accountsApi.login({ loginId: login.loginId, action: 'code', code: code.trim() });
          if ('loginId' in result) setLogin(result); // A submitted receipt is not login completion; keep polling.
          setCode('');
        }); }}>
          <Field id="account-code" label={t('claudeAccounts.code')} error={fieldError}><Input id="account-code" value={code} autoComplete="off" disabled={busy} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'account-code-error' : undefined} onChange={e => { setCode(e.target.value); setFieldError(''); }} /></Field>
          <Button type="submit" busy={busy}>{t('submit')}</Button>
        </form></details>}
        <p className="muted">{t('accounts.agentFlow')}</p>
      </>}
      {login?.browserError && <Notice tone="warning">{login.browserError}</Notice>}
      {login?.next?.message && <Notice tone="warning">{login.next.message}</Notice>}
      {login?.error && <Notice>{login.error}</Notice>}
      {login?.errors?.map((message, index) => <Notice key={index}>{message}</Notice>)}
      {step === 2 && !login?.accountId && <>{detected.length ? <SingleChoice label={t('accounts.detected')} value={detectedId} onChange={value => { setIdentity(undefined); setDetectedId(value); }} options={detected.map(account => ({ value: account.id, label: account.alias }))} /> : <p role="status">{t('accounts.noneDetected')}</p>}</>}
      {step === 2 && identity && <form id="account-confirm" className="account-form" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <Private>{[identity.email, identity.orgName].filter(Boolean).join(' · ')}</Private>
        {!!identity.sources.length && !!identity.agentProfiles.length && <Notice tone="success">{t('accounts.matched')}</Notice>}
        <Field id="account-alias" label={t('accounts.alias')} error={fieldError}><Input id="account-alias" autoFocus value={alias} disabled={busy} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'account-alias-error' : undefined} onChange={e => { setAlias(e.target.value); setFieldError(''); }} /></Field>
        {identity.agentProfiles.length > 0 && <fieldset><legend>{t('accounts.useFor')}</legend>{identity.agentProfiles.map(profile => <Checkbox key={profile.profileId} checked={defaults.includes(profile.agent)} disabled={profile.default || busy || profile.state !== 'signed-in'} onChange={value => setDefaults(old => value ? [...old, profile.agent] : old.filter(agent => agent !== profile.agent))}>{profile.agent} · {t(`accounts.profile.${profile.state}`)}</Checkbox>)}</fieldset>}
      </form>}
      {error && <Notice action={login?.state === 'completed' ? <Button onClick={() => setIdentityRetry(value => value + 1)}>{t('retry')}</Button> : undefined}>{error}</Notice>}
    </div>
  </Dialog>;
}
