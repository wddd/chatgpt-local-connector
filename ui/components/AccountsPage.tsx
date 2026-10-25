import { useEffect, useState } from 'react';
import { accountsApi } from '../api';
import type { ProviderAccount as Account, AccountLogin } from '../types';
import { t } from '../i18n';
import { accounts, refreshAccounts, useAccounts, isUnidentified } from '../state/accounts';
import { connector } from '../state/connector';
import { navigation } from '../state/navigation';
import { openOnboarding } from '../state/onboarding';
import { Button, Dialog, Empty, Field, HoverScope, Input, Notice, Status, Switch, Tag } from './ui';
import { PrivacyToggle } from './Privacy';
import { Sensitive, SensitiveIdentity } from './Sensitive';
import { AccountNotifications, AccountQuota } from './AccountCards';
import AddAccount from './AddAccount';
import { openSourceWorkspace } from './SourcePanel';

export function AccountsActions() {
  const { items } = accounts.use();
  return <><span className="muted small">{t('accounts.count', { count: items.length })}</span><PrivacyToggle /><Button variant="primary" onClick={() => navigation.set(old => ({ ...old, addAccount: true }))}>{t('accounts.add')}</Button></>;
}
export default function AccountsPage() {
  const state = useAccounts(), nav = navigation.use();
  const [selected, setSelected] = useState<string>();
  const account = state.items.find(a => a.id === (nav.accountId ?? selected)) ?? state.items[0];
  const [login, setLogin] = useState<AccountLogin>();
  return <div className="accounts-workspace">
    {state.error && <Notice action={<Button onClick={() => void refreshAccounts()}>{t('retry')}</Button>}>{state.error}</Notice>}
    {state.loading && <p role="status">{t('loading')}</p>}
    {!state.loading && !state.error && !state.items.length && <Empty>{t('accounts.empty')}</Empty>}
    <div className="accounts-columns">
      <nav className="account-list" aria-label={t('accounts.title')}><HoverScope>{['anthropic', 'openai', 'deepseek', 'other'].map(provider => {
        const rows = state.items.filter(a => a.provider === provider);
        return rows.length > 0 && <section key={provider}><h3>{t(`accounts.provider.${provider}`)}</h3>{rows.map(row => <Button key={row.id} variant="ghost" className="account-list-row" data-hover-target={row.id} aria-current={account?.id === row.id ? 'true' : undefined} onClick={() => { setSelected(row.id); navigation.set(old => ({ ...old, accountId: undefined })); }}>
          <span className="account-avatar" data-provider={row.provider}>{row.alias.slice(0, 1).toUpperCase()}</span><span className="account-row-copy"><strong>{row.alias}</strong><Sensitive>{row.email}</Sensitive><span className="account-roles">{!!row.sources.length && <Tag>SRC</Tag>}{!!row.agentProfiles.length && <Tag>AGENT</Tag>}</span></span>
          {(row.notifications.state === 'not-bound' || row.agentProfiles.some(p => p.state !== 'signed-in')) && <span className="account-warning" role="img" aria-label={t('accounts.attention')} />}
        </Button>)}</section>;
      })}</HoverScope></nav>
      {account && <AccountDetail key={account.id} account={account} onLogin={setLogin} onAdd={() => navigation.set(old => ({ ...old, addAccount: true }))} />}
    </div>
    {(nav.addAccount || login) && <AddAccount initialLogin={login ?? (state.login && ['starting', 'waiting'].includes(state.login.state) ? state.login : undefined)} onClose={() => { setLogin(undefined); navigation.set(old => ({ ...old, addAccount: false })); }} />}
  </div>;
}
function AccountDetail({ account, onLogin, onAdd }: { account: Account; onLogin: (login: AccountLogin) => void; onAdd: () => void }) {
  const { sources, status } = connector.use();
  const [alias, setAlias] = useState(account.alias), [error, setError] = useState(''), [aliasError, setAliasError] = useState('');
  const [busy, setBusy] = useState(false), [remove, setRemove] = useState(false);
  useEffect(() => setAlias(account.alias), [account.alias]);
  async function action(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); await refreshAccounts(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  function saveAlias() {
    if (!alias.trim()) { setAliasError(t('fieldRequired')); document.getElementById('account-detail-alias')?.focus(); return; }
    if (alias.trim() !== account.alias && !busy) void action(() => accountsApi.update({ id: account.id, alias: alias.trim() }));
  }
  return <div className="account-detail">
    <header className="account-detail-header"><form onSubmit={e => { e.preventDefault(); saveAlias(); }}><Field id="account-detail-alias" label={t('accounts.alias')} error={aliasError}><Input id="account-detail-alias" value={alias} disabled={busy} aria-invalid={!!aliasError} aria-describedby={aliasError ? 'account-detail-alias-error' : undefined} onChange={e => { setAlias(e.target.value); setAliasError(''); }} onBlur={saveAlias} /></Field></form>{account.plan && <Tag>{account.plan}</Tag>}<SensitiveIdentity email={account.email} orgName={account.orgName} /></header>
    {isUnidentified(account) && <p className="muted">{t(account.sources.length ? 'accounts.unidentified' : 'accounts.nativeAuth')}</p>}
    {error && !remove && <Notice>{error}</Notice>}
    <h3>{t('accounts.where')}</h3><div className="account-role-cards">
      <section className="account-card"><h3>{t('accounts.controlSource')}</h3>{account.sources.length ? account.sources.map(id => {
        const source = sources.find(s => s.id === id), ingress = status?.ingresses.find(i => i.id === source?.ingressId);
        return <div key={id} className="account-connection"><strong>{source?.label ?? id}</strong><Status tone={source?.state === 'connected' ? 'success' : 'neutral'}>{source ? t(`source.state.${source.state}`) : '—'}</Status><span className="muted small">{ingress?.name ?? source?.connectionName}</span><span className="muted small">{t('source.lastSeen')}: {source?.lastSeenAt ? new Date(source.lastSeenAt * 1000).toLocaleString() : '—'}</span><Button disabled={!source} onClick={() => openSourceWorkspace(id)}>{t('accounts.openSource')}</Button></div>;
      }) : <><p className="muted">{t('accounts.noSource')}</p><Button onClick={() => { navigation.set(old => ({ ...old, page: 'overview' })); openOnboarding(); }}>{t('addControlSource')}</Button></>}</section>
      <section className="account-card"><h3>Agent</h3>{account.agentProfiles.length ? account.agentProfiles.map(profile => <div key={profile.profileId} className="account-profile"><div className="source-section-heading"><strong>{profile.agent}</strong><Status tone={profile.state === 'signed-in' ? 'success' : 'warning'}>{t(`accounts.profile.${profile.state}`)}</Status></div><span className="muted small">{profile.kind}</span><div className="source-section-heading"><span>{t('accounts.default')}</span><Switch label={`${profile.agent} · ${t('accounts.default')}`} checked={profile.default} disabled={busy || profile.default || profile.state !== 'signed-in'} onChange={() => void action(() => accountsApi.update({ id: account.id, defaultFor: profile.agent }))} /></div>{['claude', 'codex'].includes(profile.agent) ? <Button disabled={busy} onClick={() => void action(async () => onLogin(await accountsApi.reauth({ id: account.id, agent: profile.agent })))}>{t('accounts.reauth')}</Button> : <p className="muted">{t('accounts.nativeAuth')}</p>}</div>) : <><p className="muted">{t('accounts.noAgent')}</p>{!isUnidentified(account) && <Button onClick={onAdd}>{t('accounts.addAgent')}</Button>}</>}</section>
    </div>
    {!!account.sources.length && !!account.agentProfiles.length && <p className="account-shared-notice">{t('accounts.sharedQuota')}</p>}
    <AccountNotifications account={account} /><AccountQuota account={account} />
    <div className="account-remove"><p className="muted">{t('accounts.removeConsequence')}</p><Button variant="danger-outline" disabled={busy} onClick={() => setRemove(true)}>{t('remove')}</Button></div>
    {remove && <Dialog centered title={t('accounts.removeTitle', { alias: account.alias })} busy={busy} onClose={() => setRemove(false)} footer={<><Button disabled={busy} onClick={() => setRemove(false)}>{t('cancel')}</Button><Button variant="danger" busy={busy} onClick={() => void action(() => accountsApi.remove({ id: account.id, running: 'finish' }))}>{t('remove')}</Button></>}><p>{t('accounts.removeConsequence')}</p>{error && <Notice>{error}</Notice>}</Dialog>}
  </div>;
}
