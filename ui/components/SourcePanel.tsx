import { EntityCard, SectionHeader, Button, DialogClose, IconButton, Notice, SingleChoice, Status } from './ui';
import { SrcAccountCard, SrcAccountRow } from './objects/src-account';
import { SrcPlatformChip } from './objects/src-platform';
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import { isLocalSource } from '../sourcePresentation';
import { AgentAccountChip } from './objects/agent-account';
import { connectionSwitch } from '../state/onboarding';
import { connector } from '../state/connector';
import { useAccounts } from '../state/accounts';
import { navigation } from '../state/navigation';
import { ingressPanel, selectAgentPanel } from '../state/overviewPanels';
import type { ControlSource } from '../state/types';
import { PrivacyToggle } from './Privacy';
import { AccountNotifications, AccountSharedNotice } from './AccountCards';
import SourceConnection from './SourceConnection';
import SourceDispatches from './SourceDispatches';

export function openSourceWorkspace(id: string) {
  ingressPanel.set(undefined);
  navigation.set(old => ({ ...old, page: 'remote', remoteSourceId: id, remoteConnectionId: undefined }));
}
export default function SourcePanel({ source, widthControl }: { source: ControlSource; widthControl?: ReactNode }) {
  const { status, sources } = connector.use(), state = useAccounts();
  const account = state.items.find(a => a.sources.includes(source.id));
  const entries = account ? sources.filter(s => account.sources.includes(s.id) && !isLocalSource(s)) : [source];
  const [tab, setTab] = useState('activity'), [selectedId, setSelectedId] = useState<string>();
  // A grouped inspector never chooses a mutation target from array order.
  const selected = entries.length === 1 ? entries[0] : entries.find(s => s.id === selectedId);
  const ingress = status?.ingresses.find(i => i.id === selected?.ingressId);
  if (isLocalSource(source)) return null;
  function openConnection(id: string) {
    ingressPanel.set(undefined);
    navigation.set(old => ({ ...old, page: 'remote', remoteSourceId: undefined, remoteConnectionId: id }));
  }
  return <>
    <SectionHeader className="dialog-header source-account-header" level={2} title={<><SrcPlatformChip product={source.product} sources={selected ? [selected] : undefined} /> · {account?.alias ?? source.label}</>}
      actions={<><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t('close')} /></DialogClose></>} />
    <div className="side-panel-scroll source-panel-content">
      {account && <Status tone={account.notifications.state === 'not-bound' ? 'warning' : 'neutral'}>{t(`accounts.notifications.${account.notifications.state}`)}</Status>}
      {entries.length > 1 && <EntityCard title={account?.alias}>
        {entries.map(entry => <SrcAccountRow key={entry.id} source={entry} selected={selected?.id === entry.id}
          ingress={status?.ingresses.find(i => i.id === entry.ingressId)} onConnection={openConnection} onOpen={() => setSelectedId(entry.id)} />)}
      </EntityCard>}
      <SingleChoice label={t('accounts.sourceTabs')} value={tab} onChange={setTab} options={['activity', 'account', 'connection'].map(value => ({ value, label: t(`accounts.tab.${value}`) }))} />
      {tab === 'activity' && (selected ? <SourceDispatches sourceId={selected.id} summary /> : entries.map(entry => <EntityCard key={entry.id} title={entry.label}><SourceDispatches sourceId={entry.id} summary /></EntityCard>))}
      {tab === 'account' && <>
        <SrcAccountCard source={selected} product={source.product} account={account} ingress={ingress} ingresses={status?.ingresses} onAuthorization={(ingressId, requestId) => connectionSwitch.set({ sourceId: selected!.id, step: 'approval', ingressId, requestId })} onConnection={openConnection} loading={state.loading} error={state.error}
          footer={account && <Button variant="link" onClick={() => { ingressPanel.set(undefined); navigation.set(old => ({ ...old, page: 'accounts', accountId: account.id, remoteSourceId: undefined })); }}>{t('accounts.openAccount')}</Button>} />
        {account && <>
          {!!account.agentProfiles.length && <EntityCard><AccountSharedNotice />{[...new Set(account.agentProfiles.map(profile => profile.agent))].map(agent => <AgentAccountChip key={agent} account={account} agent={agent} onOpen={() => { selectAgentPanel({ type: 'agent', agent, accountId: account.id }); navigation.set(old => ({ ...old, page: 'overview', remoteSourceId: undefined })); }} />)}</EntityCard>}
          <AccountNotifications account={account} />
        </>}
      </>}
      {tab === 'connection' && (selected ? <SourceConnection key={selected.id} source={selected} account={account} onConnection={openConnection} /> : <Notice tone="warning">{t('source.selectForActions')}</Notice>)}
    </div>
  </>;
}
