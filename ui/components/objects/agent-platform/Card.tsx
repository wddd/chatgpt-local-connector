import type { ReactNode } from 'react';
import { name, compactAgentVersion, agentLinks, type Agent } from '../../../state/agents';
import type { ProviderAccount } from '../../../types';
import { t } from '../../../i18n';
import { Button, EntityCard, SectionHeader, SettingRow, Notice } from '../../ui';
import { AgentQuotaIcon } from '../../../subscriptions/QuotaRing';
import './agent-platform.css';

export function AgentPlatformCard({ agent, frame = 'detail', quota, onOpen, onLink, headerActions, titleActions, secondary, children, error, loading }: {
  agent: Agent; frame?: 'catalog' | 'detail' | 'panel'; quota?: ProviderAccount['quota'] | null;
  onOpen?: () => void; onLink?: (url: string) => void; headerActions?: ReactNode; titleActions?: ReactNode; secondary?: ReactNode; children?: ReactNode; error?: string; loading?: boolean;
}) {
  const classes = { catalog: 'agent-object-card agent-object-catalog agent-card', detail: 'agent-object-card agent-object-detail', panel: 'agent-object-card agent-object-panel' };
  const version = agent.installed === false ? t('agentNotInstalled') : compactAgentVersion(agent.version);
  const link = agentLinks[agent.agent];
  return <EntityCard className={classes[frame]} aria-busy={loading}>
    {frame === 'catalog' ? <>
      <Button variant="surface" className="agent-detail-trigger" aria-label={name(agent)} aria-haspopup={onOpen ? "dialog" : undefined} disabled={!onOpen || loading} onClick={onOpen}><AgentQuotaIcon agent={agent.agent} quota={quota} /></Button>
      <SettingRow label={link && onLink ? <a href={link} draggable={false} onClick={event => { event.preventDefault(); onLink(link); }}>{name(agent)}</a> : <strong>{name(agent)}</strong>} description={<span title={agent.version ?? undefined}>{version}</span>}>{headerActions}</SettingRow>
    </> : <SectionHeader className={frame === 'panel' ? 'dialog-header agent-panel-header' : 'agent-summary'} level={2} leading={<AgentQuotaIcon agent={agent.agent} quota={quota} dual={frame === 'panel'} />} title={name(agent)} titleProps={{ className: 'activity-panel-title', tabIndex: -1, title: name(agent) }} titleActions={titleActions} secondary={secondary ?? <p title={agent.version ?? undefined}>{version}</p>} actions={headerActions} />}
    {frame !== 'catalog' && link && onLink && <Button variant="link" onClick={() => onLink(link)}>{t('officialSetup')}</Button>}
    {agent.adapter && agent.adapter.state !== 'ready' && <p className="agent-adapter" role={agent.adapter.state === 'failed' ? 'alert' : 'status'}>{t(agent.adapter.state === 'preparing' ? 'agentAdapterPreparing' : agent.adapter.state === 'failed' ? 'agentAdapterFailed' : 'agentAdapterMissing')}{agent.adapter.error && ` · ${t(({ CLAUDE_ADAPTER_DOWNLOAD_FAILED: 'agentAdapterDownloadFailed', CLAUDE_ADAPTER_CHECKSUM_FAILED: 'agentAdapterChecksumFailed', CLAUDE_ADAPTER_EXTRACT_FAILED: 'agentAdapterExtractFailed', CLAUDE_ADAPTER_PROBE_FAILED: 'agentAdapterProbeFailed' } as Record<string, string>)[agent.adapter.error] || 'agentAdapterSetupFailed')}`}</p>}
    {(error || (agent.discoveryError && agent.discoveryError !== 'AGENT_NOT_INSTALLED')) && <Notice>{error || agent.discoveryError}</Notice>}
    {frame === 'panel' ? <div className="agent-view-scroll">{children}</div> : children}
  </EntityCard>;
}
