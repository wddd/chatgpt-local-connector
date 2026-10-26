import { useState, type ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { t } from '../i18n';
import { controlSource } from '../controlSources';
import { isLocalSource } from '../sourcePresentation';
import { name as agentName } from '../state/agents';
import { connector } from '../state/connector';
import { useAccounts } from '../state/accounts';
import { navigation } from '../state/navigation';
import { srcPanel, selectAgentPanel, selectSourcePanel } from '../state/overviewPanels';
import type { ControlSource } from '../state/types';
import { Button, DialogClose, IconButton, Notice, SingleChoice, Status, Tag } from './ui';
import { PrivacyToggle } from './Privacy';
import { AccountNotifications } from './AccountCards';
import AccountMaintenance from './AccountMaintenance';
import OAuthGrants from './OAuthGrants';
import SourceConnection from './SourceConnection';
import SourceDispatches from './SourceDispatches';
import SourceIcon from './SourceIcon';
export function openSourceWorkspace(id: string) {
  const source = connector.get().sources.find(source => source.id === id);
  if (!source || isLocalSource(source)) return;
  selectSourcePanel(source.product, { sourceId: source.id });
  navigation.set(old => ({ ...old, page: 'overview', remoteSourceId: undefined, remoteConnectionId: undefined }));
}
export default function SourcePanel({ source, widthControl, onBack }: { source: ControlSource; widthControl?: ReactNode; onBack?: () => void }) {
  const { status, sources } = connector.use(), state = useAccounts();
  const account = state.items.find(account => account.sources.includes(source.id));
  const ingress = status?.ingresses.find(ingress => ingress.id === source.ingressId);
  const [busy, setBusy] = useState(false);
  if (isLocalSource(source)) return null;
  const memberships = sources.filter(item => account?.sources.includes(item.id) && item.product === source.product);
  const back = onBack ?? (() => selectSourcePanel(source.product, { platformOnly: true }));
  const platform = controlSource(source.product)?.displayName ?? source.product;
  const details = <>
    {account?.agentProfiles.map(profile => <Button key={profile.profileId} variant="link" onClick={() => { selectAgentPanel({ type: 'agent', agent: profile.agent, accountId: account.id }); navigation.set(old => ({ ...old, page: 'overview' })); }}>{agentName(profile)} · {account.alias}</Button>)}
    {memberships.length > 1 && <SingleChoice label={t('source.connections')} value={source.id} onChange={openSourceWorkspace} options={memberships.map(item => ({ value: item.id, label: `${item.label} · ${status?.ingresses.find(ingress => ingress.id === item.ingressId)?.name ?? item.connectionName ?? t('source.connectionRemoved')}` }))} />}
    <SourceConnection source={source} onConnection={id => { srcPanel.set(undefined); navigation.set(old => ({ ...old, page: 'connections', remoteSourceId: undefined, remoteConnectionId: id })); }} />
    {source.credential.type === 'oauth-grant' && <OAuthGrants sourceId={source.id} ingressId={source.ingressId} onBusy={setBusy} />}
    {account && <AccountNotifications account={account} />}
    <section className="account-card"><h3>{t('accounts.tab.activity')}</h3><SourceDispatches sourceId={source.id} summary /></section>
  </>;
  return <>
    <header className="dialog-header source-account-header"><div className="actions"><IconButton icon={ArrowLeft} label={t('back')} onClick={back} /><SourceIcon platform={source.product} /></div>
      <div className="source-account-heading"><h2>{platform} · {account?.alias ?? source.label}</h2></div>
      <div className="actions"><PrivacyToggle />{widthControl}<DialogClose asChild><IconButton icon={X} label={t('close')} disabled={busy} /></DialogClose></div>
    </header>
    <div className="side-panel-scroll source-panel-content">
      <div className="account-chips"><Status tone={source.state === 'connected' ? 'success' : 'neutral'}>{t(`source.state.${source.state}`)}</Status><Tag>{ingress?.name ?? source.connectionName ?? t('source.connectionRemoved')}</Tag></div>
      {state.error && <Notice>{state.error}</Notice>}
      {account ? <AccountMaintenance account={account} onRemoved={back}>{details}</AccountMaintenance> : <><p role="status" className="muted">{t(state.loading ? 'loading' : 'accounts.identityUnavailable')}</p>{details}</>}
    </div>
  </>;
}
