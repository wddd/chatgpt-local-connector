import { SrcAccountRow } from "./objects/src-account";
import { EntityRow, StateBadge, EntityCard, SectionHeader, Button, Dialog, Empty, Field, HoverScope, Icon, Input, Notice, Switch, Tag } from "./ui";
import { statePresentation } from "./objects/statePresentation";
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { accountsApi } from '../api';
import type { ProviderAccount as Account, AccountLogin } from '../types';
import { t } from '../i18n';
import { accounts, refreshAccounts, useAccounts, isUnidentified } from '../state/accounts';
import { connector } from '../state/connector';
import { subscriptions } from '../state/subscriptions';
import { accountPlatform, accountOwns } from '../accountPresentation';
import { name as agentName } from '../state/agents';
import { navigation } from '../state/navigation';
import { openOnboarding } from '../state/onboarding';
import { PrivacyToggle } from './Privacy';
import { Sensitive, SensitiveIdentity } from './Sensitive';
import { AccountNotifications, AccountQuota, AccountSharedNotice } from './AccountCards';
import AddAccount from './AddAccount';
import { openSourceWorkspace } from './SourcePanel';
import AccountAvatar from './AccountAvatar';
import MergeAccounts from './MergeAccounts';

export function AccountsActions() {
  const { items } = accounts.use();
  return <><span className="muted small">{t('accounts.count', { count: items.length })}</span><PrivacyToggle /><Button variant="primary" onClick={() => navigation.set(old => ({ ...old, addAccount: true }))}>{t('accounts.add')}</Button></>;
}
export default function AccountsPage() {
  const state = useAccounts(), nav = navigation.use();
  const { sources } = connector.use(), { snapshot } = subscriptions.use();
  const [selected, setSelected] = useState<string>();
  const account = state.items.find(a => accountOwns(a, nav.accountId ?? selected)) ?? state.items[0];
  const [login, setLogin] = useState<AccountLogin>();
  const [roleAccount, setRoleAccount] = useState<Account>();
  const groups = new Map<string, { label: string; accounts: Account[] }>();
  for (const item of state.items) {
    const platform = accountPlatform(item, sources, snapshot?.providers ?? []);
    const group = groups.get(platform.id) ?? { label: platform.label, accounts: [] };
    group.accounts.push(item); groups.set(platform.id, group);
  }
  return <div className="accounts-workspace">
    {state.error && <Notice action={<Button onClick={() => void refreshAccounts()}>{t('retry')}</Button>}>{state.error}</Notice>}
    {state.loading && <p role="status">{t('loading')}</p>}
    {!state.loading && !state.error && !state.items.length && <Empty>{t('accounts.empty')}</Empty>}
    <div className="accounts-columns">
      <nav className="account-list" aria-label={t('accounts.title')}><HoverScope>{[...groups].map(([provider, group]) => {
        return <section key={provider}><h3>{group.label}</h3>{group.accounts.map(row => <EntityRow key={row.id} data-hover-target={row.id} onClick={() => { setSelected(row.id); navigation.set(old => ({ ...old, accountId: undefined })); }} selected={account?.id === row.id} leading={<><AccountAvatar account={row} /></>} title={row.alias} secondary={<>{row.email && <Sensitive>{row.email}</Sensitive>}<span className="account-roles">{!!row.sources.length && <Tag tone="source">SRC</Tag>}{!!row.agentProfiles.length && <Tag tone="agent">AGENT</Tag>}</span></>} state={<>{(row.notifications.state === 'not-bound' || row.agentProfiles.some(p => p.state !== 'signed-in')) && <StateBadge variant="dot" presentation={statePresentation("account", "attention")} />}</>} />)}</section>;
      })}</HoverScope></nav>
      {account && <AccountDetail key={account.id} account={account} onLogin={setLogin} onAdd={() => setRoleAccount(account)} />}
    </div>
    {(nav.addAccount || login || roleAccount) && <AddAccount forAccount={roleAccount} initialLogin={login ?? (!roleAccount && state.login && ['starting', 'waiting'].includes(state.login.state) ? state.login : undefined)} onClose={() => { setLogin(undefined); setRoleAccount(undefined); navigation.set(old => ({ ...old, addAccount: false })); }} />}
  </div>;
}
function AccountDetail({ account, onLogin, onAdd }: { account: Account; onLogin: (login: AccountLogin) => void; onAdd: () => void }) {
  const { sources, status } = connector.use();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [remove, setRemove] = useState(false);
  const [merging, setMerging] = useState(false);
  async function action(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); await refreshAccounts(); return true; } catch (e) { setError(String(e)); return false; } finally { setBusy(false); } }
  return <div className="account-detail">
    <SectionHeader className="account-detail-header" level={2} titleAsChild leading={<><AccountAvatar account={account} /></>} title={<><AccountAlias account={account} busy={busy} onSave={alias => action(() => accountsApi.update({ id: account.id, alias }))} /></>} secondary={<><div className="account-detail-meta"><SensitiveIdentity email={account.email} orgName={account.orgName} />{account.plan && <>{(account.email || account.orgName) && <span aria-hidden="true"> · </span>}<Tag>{account.plan}</Tag></>}</div></>} actions={<><Button variant="ghost" onClick={() => setMerging(true)}>{t('accounts.merge')}</Button></>} />
    {isUnidentified(account) && <p className="muted">{t(account.sources.length ? 'accounts.unidentified' : 'accounts.nativeAuth')}</p>}
    {error && !remove && <Notice>{error}</Notice>}
    <h3>{t('accounts.where')}</h3><div className="account-role-cards">
      <EntityCard title={t('accounts.controlSource')}>{account.sources.length ? account.sources.map(id => {
        const source = sources.find(s => s.id === id), ingress = status?.ingresses.find(i => i.id === source?.ingressId);
        return source ? <SrcAccountRow key={id} source={source} ingress={ingress} onOpen={() => openSourceWorkspace(id)} onConnection={connectionId => navigation.set(old => ({ ...old, page: 'remote', remoteConnectionId: connectionId, remoteSourceId: undefined }))} /> : <p key={id} className="muted">{t('accounts.identityUnavailable')}</p>;
      }) : <><p className="muted">{t('accounts.noSource')}</p><Button variant="link" onClick={() => { navigation.set(old => ({ ...old, page: 'overview' })); openOnboarding(); }}>{t('addControlSource')}</Button></>}</EntityCard>
      <EntityCard title="Agent">{account.agentProfiles.length ? account.agentProfiles.map(profile => <EntityRow key={profile.profileId} className="account-profile"><SectionHeader level={3} title={<><strong>{agentName(profile)}</strong></>} actions={<><StateBadge presentation={statePresentation("profile", profile.state)} /></>} /><span className="muted small">{profile.kind}</span><SectionHeader level={3} title={<><span>{t('accounts.default')}</span></>} actions={<><Switch label={`${agentName(profile)} · ${t('accounts.default')}`} checked={profile.default} disabled={busy || profile.default || profile.state !== 'signed-in'} onChange={() => void action(() => accountsApi.update({ id: account.id, defaultFor: profile.agent }))} /></>} />{['claude', 'codex'].includes(profile.agent) ? <Button variant="link" disabled={busy} onClick={() => void action(async () => onLogin(await accountsApi.reauth({ id: account.id, agent: profile.agent })))}>{t('accounts.reauth')}</Button> : <p className="muted">{t('accounts.nativeAuth')}</p>}</EntityRow>) : <><p className="muted">{t('accounts.noAgent')}</p><Button variant="link" onClick={onAdd}>{t('accounts.addAgent')}</Button></>}</EntityCard>
    </div>
    {!!account.sources.length && !!account.agentProfiles.length && <AccountSharedNotice />}
    <AccountQuota account={account} /><AccountNotifications account={account} />
    <div className="account-remove"><p className="muted">{t('accounts.removeConsequence')}</p><Button variant="danger-outline" disabled={busy} onClick={() => setRemove(true)}>{t('remove')}</Button></div>
    {remove && <Dialog centered title={t('accounts.removeTitle', { alias: account.alias })} busy={busy} onClose={() => setRemove(false)} footer={<><Button disabled={busy} onClick={() => setRemove(false)}>{t('cancel')}</Button><Button variant="danger" busy={busy} onClick={() => void action(() => accountsApi.remove({ id: account.id, running: 'finish' }))}>{t('remove')}</Button></>}><p>{t('accounts.removeConsequence')}</p>{error && <Notice>{error}</Notice>}</Dialog>}
    {merging && <MergeAccounts account={account} onClose={() => setMerging(false)} />}
  </div>;
}

function AccountAlias({ account, busy, onSave }: { account: Account; busy: boolean; onSave: (alias: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false), [alias, setAlias] = useState(account.alias), [error, setError] = useState('');
  const active = useRef(false), saving = useRef(false), restoreFocus = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!editing && restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus(); } }, [editing]);
  function finish(returnFocus: boolean) { active.current = false; restoreFocus.current = returnFocus; setEditing(false); }
  async function save(returnFocus: boolean) {
    if (!active.current || saving.current) return;
    const value = alias.trim();
    if (!value) { setError(t('fieldRequired')); document.getElementById('account-detail-alias')?.focus(); return; }
    saving.current = true;
    try { if (value === account.alias || await onSave(value)) finish(returnFocus); }
    finally { saving.current = false; }
  }
  return editing ? <form className="account-alias-editor" onSubmit={event => { event.preventDefault(); void save(true); }}>
    <Field id="account-detail-alias" label={<span className="sr-only">{t('accounts.alias')}</span>} error={error}>
      <Input id="account-detail-alias" autoFocus value={alias} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'account-detail-alias-error' : undefined}
        onFocus={event => event.currentTarget.select()} onChange={event => { setAlias(event.target.value); setError(''); }} onBlur={() => void save(false)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') { event.preventDefault(); void save(true); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); }
        }} />
    </Field>
  </form> : <h2><Button ref={trigger} variant="ghost" className="account-alias-trigger" disabled={busy} aria-label={t('accounts.editAlias', { alias: account.alias })}
    onClick={() => { active.current = true; setAlias(account.alias); setError(''); setEditing(true); }}>{account.alias}<Icon icon={Pencil} /></Button></h2>;
}
