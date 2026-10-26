import { statePresentation } from "./objects/statePresentation";
import { StateBadge, EntityCard, SectionHeader, Button, DialogClose, IconButton, Notice, SingleChoice, Status, Switch, Tag, PlatformIcon } from "./ui";
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { t } from '../i18n';
import { controlSource } from '../controlSources';
import { isLocalSource } from '../sourcePresentation';
import { name as agentName } from '../state/agents';
import { connector, refreshConnector } from '../state/connector';
import { useAccounts, isUnidentified } from '../state/accounts';
import { navigation } from '../state/navigation';
import { ingressPanel, selectAgentPanel } from '../state/overviewPanels';
import type { ControlSource } from '../state/types';
import { PrivacyToggle } from './Privacy';
import { Sensitive, SensitiveIdentity } from './Sensitive';
import { AccountNotifications, AccountQuota, AccountSharedNotice } from './AccountCards';
import SourceConnection from './SourceConnection';
import SourceDispatches from './SourceDispatches';

export function openSourceWorkspace(id: string) {
  ingressPanel.set(undefined);
  navigation.set(old => ({ ...old, page: 'remote', remoteSourceId: id, remoteConnectionId: undefined }));
}
export default function SourcePanel({ source, widthControl }: { source: ControlSource; widthControl?: ReactNode }) {
  const { status, sources } = connector.use(), state = useAccounts();
  const account = state.items.find(a => a.sources.includes(source.id));
  const ingress = status?.ingresses.find(i => i.id === source.ingressId);
  const [tab, setTab] = useState('activity'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (isLocalSource(source)) return null;
  const shared = sources.filter(s => s.ingressId === source.ingressId && s.state !== 'revoked').length > 1;
  const platform = controlSource(source.product)?.displayName ?? agentName({ agent: source.product });
  return <>
    <SectionHeader className="dialog-header source-account-header" level={2} leading={<PlatformIcon role="source" platform={source.product} />} title={<>{platform} · {account?.alias ?? t('accounts.identityUnavailable')}</>} secondary={<><Sensitive>{account?.email}</Sensitive></>} actions={<><Switch label={t('sourcePanel.enabled')} checked={!!ingress?.enabled} disabled={!ingress || busy} onChange={enabled => {
        if (!ingress) return;
        setBusy(true); setError(''); void api(`ingress/${ingress.id}`, 'PUT', { enabled }).then(refreshConnector).catch(e => setError(String(e))).finally(() => setBusy(false));
      }} /><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t('close')} disabled={busy} /></DialogClose></>} />
    <div className="side-panel-scroll source-panel-content">
      <div className="account-chips"><StateBadge presentation={statePresentation("source", source?.pendingSwitch ? "pending-switch" : source?.state)} /><Tag>{ingress?.name ?? source.connectionName ?? t('source.connectionRemoved')}</Tag>{account && <Status tone={account.notifications.state === 'not-bound' ? 'warning' : 'neutral'}>{t(`accounts.notifications.${account.notifications.state}`)}</Status>}</div>
      {shared && <p className="muted small">{t('accounts.sharedConnection')}</p>}
      {error && <Notice>{error}</Notice>}
      <SingleChoice label={t('accounts.sourceTabs')} value={tab} onChange={setTab} options={['activity', 'account', 'connection'].map(value => ({ value, label: t(`accounts.tab.${value}`) }))} />
      {tab === 'activity' && <SourceDispatches sourceId={source.id} summary />}
      {tab === 'account' && <>{state.error && <Notice>{state.error}</Notice>}{account ? <>
        <EntityCard><SectionHeader level={3} title={<>{account.alias}</>} actions={<>{account.plan && <Tag>{account.plan}</Tag>}</>} /><SensitiveIdentity email={account.email} orgName={account.orgName} wrap /><div><Sensitive wrap>{account.identityKey}</Sensitive></div><p className="muted">{t(isUnidentified(account) ? 'accounts.unidentified' : 'accounts.whoami')}</p>
          <Button variant="link" onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: 'accounts', accountId: account.id, remoteSourceId: undefined })); }}>{t('accounts.openAccount')}</Button></EntityCard>
        {!!account.agentProfiles.length && <EntityCard><AccountSharedNotice />{account.agentProfiles.map(profile => <Button key={profile.profileId} variant="link" onClick={() => { selectAgentPanel({ type: 'agent', agent: profile.agent, accountId: account.id }); navigation.set(old => ({ ...old, page: 'overview', remoteSourceId: undefined })); }}>{agentName(profile)} · {account.alias}</Button>)}</EntityCard>}
        <AccountQuota account={account} /><AccountNotifications account={account} />
      </> : <p role="status" className="muted">{t(state.loading ? 'loading' : 'accounts.identityUnavailable')}</p>}</>}
      {tab === 'connection' && <SourceConnection source={source} onConnection={id => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: 'remote', remoteSourceId: undefined, remoteConnectionId: id })); }} />}
    </div>
  </>;
}
