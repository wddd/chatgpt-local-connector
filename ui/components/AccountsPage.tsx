import { AgentAccountCard, AgentAccountRow } from './objects/agent-account';
import { AgentProfileRow } from './objects/agent-account/Row';
import { SrcAccountRow } from "./objects/src-account";
import { DangerZone, EntityCard, Button, Dialog, Empty, Field, HoverScope, Icon, Input, Notice } from "./ui";
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { accountsApi } from '../api';
import type { ProviderAccount as Account, AccountLogin } from '../types';
import { t } from '../i18n';
import { accounts, refreshAccounts, useAccounts, isUnidentified } from '../state/accounts';
import { connector } from '../state/connector';
import { subscriptions } from '../state/subscriptions';
import { accountPlatform, accountOwns } from '../accountPresentation';
import { navigation } from '../state/navigation';
import { openOnboarding } from '../state/onboarding';
import { PrivacyToggle } from './Privacy';
import { AccountNotifications, AccountQuota, AccountSharedNotice } from './AccountCards';
import AddAccount from './AddAccount';
import { openSourceWorkspace } from './SourcePanel';
import { AccountIdentityIcon } from './objects/agent-account/identity';
import MergeAccounts from './MergeAccounts';

export function AccountsActions() {
  const { items } = accounts.use();
  return <><span className="text-xs text-muted-foreground">{t('accounts.count', { count: items.length })}</span><PrivacyToggle /><Button variant="primary" onClick={() => navigation.set(old => ({ ...old, addAccount: true }))}>{t('accounts.add')}</Button></>;
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
  return <div className="accounts-workspace @container flex min-h-0 flex-1 flex-col gap-3">
    {state.error && <Notice action={<Button onClick={() => void refreshAccounts()}>{t('retry')}</Button>}>{state.error}</Notice>}
    {state.loading && <p role="status">{t('loading')}</p>}
    {!state.loading && !state.error && !state.items.length && <Empty>{t('accounts.empty')}</Empty>}
    <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-3 overflow-auto @xl:auto-rows-auto @xl:grid-cols-5 @xl:grid-rows-1 @xl:overflow-hidden @4xl:gap-6">
      <nav className="account-list min-h-0 min-w-0 overscroll-contain @xl:col-span-2 @xl:overflow-y-auto @xl:pr-1.5" aria-label={t('accounts.title')}><HoverScope>{[...groups].map(([provider, group]) => {
        return <section key={provider}><h3 className="mx-2.5 mt-4 mb-2 text-xs text-muted-foreground">{group.label}</h3>{group.accounts.map(row => <AgentAccountRow key={row.id} account={row} sources={sources} providers={snapshot?.providers} onOpen={() => { setSelected(row.id); navigation.set(old => ({ ...old, accountId: undefined })); }} selected={account?.id === row.id} />)}</section>;
      })}</HoverScope></nav>
      {account && <AccountDetail key={account.id} account={account} onLogin={setLogin} onAdd={() => setRoleAccount(account)} />}
    </div>
    {(nav.addAccount || login || roleAccount) && <AddAccount forAccount={roleAccount} initialLogin={login ?? (!roleAccount && state.login && ['starting', 'waiting'].includes(state.login.state) ? state.login : undefined)} onClose={() => { setLogin(undefined); setRoleAccount(undefined); navigation.set(old => ({ ...old, addAccount: false })); }} />}
  </div>;
}
function AccountDetail({ account, onLogin, onAdd }: { account: Account; onLogin: (login: AccountLogin) => void; onAdd: () => void }) {
  const { sources, status } = connector.use();
  const { snapshot } = subscriptions.use();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [remove, setRemove] = useState(false);
  const [merging, setMerging] = useState(false);
  async function action(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); await refreshAccounts(); return true; } catch (e) { setError(String(e)); return false; } finally { setBusy(false); } }
  return <div className="grid min-h-0 min-w-0 content-start gap-4 overscroll-contain @xl:col-span-3 @xl:overflow-y-auto @xl:pr-1.5">
    <AgentAccountCard account={account} showProfiles={false} icon={<AccountIdentityIcon account={account} sources={sources} providers={snapshot?.providers ?? []} />} title={<AccountAlias account={account} busy={busy} onSave={alias => action(() => accountsApi.update({ id: account.id, alias }))} />} headerActions={<Button variant="ghost" onClick={() => setMerging(true)}>{t('accounts.merge')}</Button>}>

    {isUnidentified(account) && <p className="text-muted-foreground">{t(account.sources.length ? 'accounts.unidentified' : 'accounts.nativeAuth')}</p>}
    {error && !remove && <Notice>{error}</Notice>}
    <h3>{t('accounts.where')}</h3><div className="grid grid-cols-1 gap-3 @4xl:grid-cols-2">
      <EntityCard title={t('accounts.controlSource')}>{account.sources.length ? account.sources.map(id => {
        const source = sources.find(s => s.id === id), ingress = status?.ingresses.find(i => i.id === source?.ingressId);
        return source ? <SrcAccountRow key={id} source={source} ingress={ingress} onOpen={() => openSourceWorkspace(id)} onConnection={connectionId => navigation.set(old => ({ ...old, page: 'remote', remoteConnectionId: connectionId, remoteSourceId: undefined }))} /> : <p key={id} className="text-muted-foreground">{t('accounts.identityUnavailable')}</p>;
      }) : <><p className="text-muted-foreground">{t('accounts.noSource')}</p><Button variant="link" onClick={() => { navigation.set(old => ({ ...old, page: 'overview' })); openOnboarding(); }}>{t('addControlSource')}</Button></>}</EntityCard>
      <EntityCard title="Agent">{account.agentProfiles.length ? account.agentProfiles.map((profile, index) => <AgentProfileRow key={`${profile.agent}:${profile.profileId}`} profile={profile} ordinal={index + 1} busy={busy}
        onDefault={selected => void action(() => accountsApi.update({ id: account.id, defaultFor: selected.agent, profileId: selected.profileId }))}
        onReauth={selected => void action(async () => onLogin(await accountsApi.reauth({ id: account.id, agent: selected.agent, profileId: selected.profileId })))} />) : <><p className="text-muted-foreground">{t('accounts.noAgent')}</p><Button variant="link" onClick={onAdd}>{t('accounts.addAgent')}</Button></>}</EntityCard>
    </div>
    {!!account.sources.length && !!account.agentProfiles.length && <AccountSharedNotice />}
    <AccountQuota account={account} /><AccountNotifications account={account} />
    <DangerZone consequence={t('accounts.removeConsequence')}><Button variant="danger-outline" disabled={busy} onClick={() => setRemove(true)}>{t('remove')}</Button></DangerZone>
    </AgentAccountCard>
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
  return editing ? <form className="min-w-0 [&_.field]:gap-0" onSubmit={event => { event.preventDefault(); void save(true); }}>
    <Field id="account-detail-alias" label={<span className="sr-only">{t('accounts.alias')}</span>} error={error}>
      <Input id="account-detail-alias" autoFocus value={alias} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'account-detail-alias-error' : undefined}
        onFocus={event => event.currentTarget.select()} onChange={event => { setAlias(event.target.value); setError(''); }} onBlur={() => void save(false)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') { event.preventDefault(); void save(true); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); }
        }} />
    </Field>
  </form> : <h2><Button ref={trigger} variant="ghost" className="h-auto max-w-full justify-start whitespace-normal p-0 text-start text-lg font-semibold wrap-anywhere [&>.icon]:shrink-0 [&>.icon]:text-muted-foreground" disabled={busy} aria-label={t('accounts.editAlias', { alias: account.alias })}
    onClick={() => { active.current = true; setAlias(account.alias); setError(''); setEditing(true); }}>{account.alias}<Icon icon={Pencil} /></Button></h2>;
}
