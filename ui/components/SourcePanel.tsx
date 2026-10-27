import { EntityCard, SectionHeader, DialogClose, IconButton, Notice, SingleChoice } from './ui';
import { SrcAccountCard, SrcAccountRow } from './objects/src-account';
import { SrcPlatformChip } from './objects/src-platform';
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import { isLocalSource } from '../sourcePresentation';
import { AgentAccountChip } from './objects/agent-account';
import { connector } from '../state/connector';
import { useAccounts } from '../state/accounts';
import { navigation } from '../state/navigation';
import { ingressPanel, selectAgentPanel, selectIngressPanel } from '../state/overviewPanels';
import type { ControlSource } from '../state/types';
import { PrivacyToggle } from './Privacy';
import { AccountSharedNotice } from './AccountCards';
import SourceConnection from './SourceConnection';
import SourceDispatches from './SourceDispatches';

export function openSourceWorkspace(id: string) {
  const { status, sources } = connector.get();
  const source = sources.find(entry => entry.id === id);
  const ingress = status?.ingresses.find(entry => entry.id === source?.ingressId);
  if (!source || !ingress || isLocalSource(source)) return;
  selectIngressPanel(ingress, { client: { id: source.id, name: source.label, source: source.product } });
  navigation.set(old => ({ ...old, page: 'overview' }));
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
  function openConnection() {
    ingressPanel.set(undefined);
    navigation.set(old => ({ ...old, page: 'connections' }));
  }
  return <>
    <SectionHeader className="dialog-header flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4 [&_h2]:min-w-0 [&_h2]:flex-1 [&_h2]:text-left [&_h2]:text-base [&_h2]:font-semibold [&_h2]:wrap-anywhere [&_.actions]:shrink-0 source-account-header flex-wrap gap-3 [&_h2]:m-0 [&_h2]:mb-1 [&_h2]:truncate [&_.section-header-copy>.sensitive-value]:text-xs [&_.section-header-copy>.sensitive-value]:text-muted-foreground [&>.actions]:ml-auto" level={2} title={<><SrcPlatformChip product={source.product} sources={selected ? [selected] : undefined} /> · {account?.alias ?? source.label}</>}
      actions={<><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t('close')} /></DialogClose></>} />
    <div className="side-panel-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto p-4 [&_h3]:mb-2 [&_h3]:text-sm source-panel-content gap-4">
      {entries.length > 1 && <EntityCard title={account?.alias}>
        {entries.map(entry => <SrcAccountRow key={entry.id} source={entry} selected={selected?.id === entry.id}
          ingress={status?.ingresses.find(i => i.id === entry.ingressId)} onConnection={openConnection} onOpen={() => setSelectedId(entry.id)} />)}
      </EntityCard>}
      <SingleChoice label={t('accounts.sourceTabs')} value={tab} onChange={setTab} options={['activity', 'account', 'connection'].map(value => ({ value, label: t(`accounts.tab.${value}`) }))} />
      {tab === 'activity' && (selected ? <SourceDispatches sourceId={selected.id} summary /> : entries.map(entry => <EntityCard key={entry.id} title={entry.label}><SourceDispatches sourceId={entry.id} summary /></EntityCard>))}
      {tab === 'account' && <>
        <SrcAccountCard source={selected} product={source.product} account={account} ingress={ingress} ingresses={status?.ingresses} onConnection={openConnection} loading={state.loading} error={state.error} />
        {account && <>
          {!!account.agentProfiles.length && <EntityCard><AccountSharedNotice />{[...new Set(account.agentProfiles.map(profile => profile.agent))].map(agent => <AgentAccountChip key={agent} account={account} agent={agent} onOpen={() => { selectAgentPanel({ type: 'agent', agent, accountId: account.id }); navigation.set(old => ({ ...old, page: 'overview' })); }} />)}</EntityCard>}
        </>}
      </>}
      {tab === 'connection' && (selected ? <SourceConnection key={selected.id} source={selected} account={account} onConnection={openConnection} /> : <Notice tone="warning">{t('source.selectForActions')}</Notice>)}
    </div>
  </>;
}
