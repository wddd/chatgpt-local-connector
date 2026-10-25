import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { t } from '../i18n';
import { connector, refreshConnector } from '../state/connector';
import { useAccounts, isUnidentified } from '../state/accounts';
import { navigation } from '../state/navigation';
import { ingressPanel, selectAgentPanel } from '../state/overviewPanels';
import type { ControlSource } from '../state/types';
import { Button, DialogClose, IconButton, Notice, SingleChoice, Status, Switch, Tag } from './ui';
import { PrivacyToggle, Private } from './Privacy';
import { AccountNotifications, AccountQuota } from './AccountCards';
import SourceConnection from './SourceConnection';
import SourceDispatches from './SourceDispatches';
import SourceIcon from './SourceIcon';
export function openSourceWorkspace(id: string) {
  ingressPanel.set(undefined);
  navigation.set(old => ({ ...old, page: 'remote', remoteSourceId: id, remoteConnectionId: undefined }));
}
export default function SourcePanel({ source, widthControl }: { source: ControlSource; widthControl?: ReactNode }) {
  const { status, sources } = connector.use(), state = useAccounts();
  const account = state.items.find(a => a.sources.includes(source.id));
  const ingress = status?.ingresses.find(i => i.id === source.ingressId);
  const [tab, setTab] = useState('activity'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const shared = sources.filter(s => s.ingressId === source.ingressId && s.state !== 'revoked').length > 1;
  const product = t(`source.product.${source.product}`);
  const platform = product.startsWith('source.product.') ? source.product === 'claude' ? 'Claude' : source.product === 'chatgpt' ? 'ChatGPT' : source.product : product;
  return <>
    <header className="dialog-header source-account-header"><div className="source-account-brand"><SourceIcon platform={source.product} /><span className="source-account-badge">{(account?.alias ?? t('accounts.identityUnavailable')).slice(0, 1)}</span></div>
      <div className="source-account-heading"><h2>{platform} · {account?.alias ?? t('accounts.identityUnavailable')}</h2><Private>{[account?.email, account?.orgName].filter(Boolean).join(' · ')}</Private></div>
      <div className="actions"><Switch label={t('sourcePanel.enabled')} checked={!!ingress?.enabled} disabled={!ingress || busy} onChange={enabled => {
        if (!ingress) return;
        setBusy(true); setError(''); void api(`ingress/${ingress.id}`, 'PUT', { enabled }).then(refreshConnector).catch(e => setError(String(e))).finally(() => setBusy(false));
      }} /><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t('close')} disabled={busy} /></DialogClose></div>
    </header>
    <div className="side-panel-scroll source-panel-content">
      <div className="account-chips"><Status tone={source.state === 'connected' ? 'success' : 'neutral'}>{t(`source.state.${source.state}`)}</Status><Tag>{ingress?.name ?? source.connectionName ?? t('source.connectionRemoved')}</Tag>{account && <Status tone={account.notifications.state === 'not-bound' ? 'warning' : 'neutral'}>{t(`accounts.notifications.${account.notifications.state}`)}</Status>}</div>
      {shared && <p className="muted small">{t('accounts.sharedConnection')}</p>}
      {error && <Notice>{error}</Notice>}
      <SingleChoice label={t('accounts.sourceTabs')} value={tab} onChange={setTab} options={['activity', 'account', 'connection'].map(value => ({ value, label: t(`accounts.tab.${value}`) }))} />
      {tab === 'activity' && <SourceDispatches sourceId={source.id} summary />}
      {tab === 'account' && <>{state.error && <Notice>{state.error}</Notice>}{account ? <>
        <section className="account-card"><div className="source-section-heading"><h3>{account.alias}</h3>{account.plan && <Tag>{account.plan}</Tag>}</div><Private>{[account.email, account.orgName].filter(Boolean).join(' · ')}</Private><div><Private>{account.identityKey}</Private></div><p className="muted">{t(isUnidentified(account) ? 'accounts.unidentified' : 'accounts.whoami')}</p>
          <Button onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: 'accounts', accountId: account.id, remoteSourceId: undefined })); }}>{t('accounts.openAccount')}</Button></section>
        {!!account.agentProfiles.length && <section className="account-card"><p>{t('accounts.sharedQuota')}</p>{account.agentProfiles.map(profile => <Button key={profile.profileId} onClick={() => { selectAgentPanel({ type: 'agent', agent: profile.agent }); navigation.set(old => ({ ...old, page: 'overview', remoteSourceId: undefined })); }}>{profile.agent} · {account.alias}</Button>)}</section>}
        <AccountQuota account={account} /><AccountNotifications account={account} />
      </> : <p role="status" className="muted">{t(state.loading ? 'loading' : 'accounts.identityUnavailable')}</p>}</>}
      {tab === 'connection' && <SourceConnection source={source} onConnection={id => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: 'remote', remoteSourceId: undefined, remoteConnectionId: id })); }} />}
    </div>
  </>;
}
