import type { ReactNode } from 'react';
import { name, compactAgentVersion, agentLinks, type Agent } from '../../../state/agents';
import type { ProviderAccount } from '../../../types';
import { t } from '../../../i18n';
import { Button, EntityCard, SectionHeader, SettingRow, Notice } from '../../ui';
import { AgentQuotaIcon } from '../../../subscriptions/QuotaRing';
import { cn } from '../../../lib/utils';

export function AgentPlatformCard({ agent, frame = 'detail', quota, onOpen, onLink, headerActions, titleActions, secondary, children, error, loading }: {
  agent: Agent; frame?: 'catalog' | 'detail' | 'panel'; quota?: ProviderAccount['quota'] | null;
  onOpen?: () => void; onLink?: (url: string) => void; headerActions?: ReactNode; titleActions?: ReactNode; secondary?: ReactNode; children?: ReactNode; error?: string; loading?: boolean;
}) {
  const classes = { catalog: 'relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-3 [&>.setting-row]:grid-cols-[minmax(0,1fr)_auto] [&>.setting-row]:gap-3 [&>.setting-row]:border-0 [&>.setting-row]:p-0 [&>.notice]:col-span-full', detail: 'rounded-none border-0 bg-transparent p-0', panel: 'flex min-h-0 flex-1 flex-col gap-0 rounded-none border-0 bg-transparent p-0' };
  const version = agent.installed === false ? t('agentNotInstalled') : compactAgentVersion(agent.version);
  const link = agentLinks[agent.agent];
  return <EntityCard className={cn("agent-object-card", classes[frame])} aria-busy={loading}>
    {frame === 'catalog' ? <>
      <Button variant="surface" className="flex justify-center rounded-md border-0 bg-transparent p-0" aria-label={name(agent)} aria-haspopup={onOpen ? "dialog" : undefined} disabled={!onOpen || loading} onClick={onOpen}><AgentQuotaIcon agent={agent.agent} quota={quota} /></Button>
      <SettingRow label={link && onLink ? <a className="text-inherit no-underline hover:underline" href={link} draggable={false} onClick={event => { event.preventDefault(); onLink(link); }}>{name(agent)}</a> : <strong>{name(agent)}</strong>} description={<span title={agent.version ?? undefined}>{version}</span>}>{headerActions}</SettingRow>
    </> : <SectionHeader className={frame === 'panel' ? 'dialog-header flex shrink-0 items-center justify-between gap-2.5 border-0 px-3.5 py-4 [&_h2]:min-w-0 [&_h2]:flex-1 [&_h2]:text-left [&_h2]:text-base [&_h2]:font-semibold [&_h2]:wrap-anywhere [&_.actions]:shrink-0 agent-panel-header [&_.section-header-copy]:flex [&_.section-header-copy]:min-w-0 [&_.section-header-copy]:flex-1 [&_.section-header-copy]:flex-col [&_.section-header-copy]:gap-0.5 [&_.activity-panel-title]:block [&_.activity-panel-title]:w-auto [&_.activity-panel-title]:flex-initial [&_.activity-panel-title]:truncate [&_.agent-quota-icon]:[--agent-quota-size:--spacing(11)]' : 'mb-5 gap-4 text-base [&_.agent-quota-icon]:size-12!'} level={2} leading={<AgentQuotaIcon agent={agent.agent} quota={quota} dual={frame === 'panel'} />} title={name(agent)} titleProps={{ className: 'activity-panel-title min-w-0 truncate text-sm leading-5 font-semibold', tabIndex: -1, title: name(agent) }} titleActions={titleActions} secondary={secondary ?? <p className="mt-1 text-xs text-muted-foreground" title={agent.version ?? undefined}>{version}</p>} actions={headerActions} />}
    {frame !== 'catalog' && link && onLink && <Button variant="link" onClick={() => onLink(link)}>{t('officialSetup')}</Button>}
    {agent.adapter && agent.adapter.state !== 'ready' && <p className={cn("m-0 text-xs text-muted-foreground wrap-anywhere", frame === 'catalog' && "col-start-2")} role={agent.adapter.state === 'failed' ? 'alert' : 'status'}>{t(agent.adapter.state === 'preparing' ? 'agentAdapterPreparing' : agent.adapter.state === 'failed' ? 'agentAdapterFailed' : 'agentAdapterMissing')}{agent.adapter.error && ` · ${t(({ CLAUDE_ADAPTER_DOWNLOAD_FAILED: 'agentAdapterDownloadFailed', CLAUDE_ADAPTER_CHECKSUM_FAILED: 'agentAdapterChecksumFailed', CLAUDE_ADAPTER_EXTRACT_FAILED: 'agentAdapterExtractFailed', CLAUDE_ADAPTER_PROBE_FAILED: 'agentAdapterProbeFailed' } as Record<string, string>)[agent.adapter.error] || 'agentAdapterSetupFailed')}`}</p>}
    {(error || (agent.discoveryError && agent.discoveryError !== 'AGENT_NOT_INSTALLED')) && <Notice>{error || agent.discoveryError}</Notice>}
    {frame === 'panel' ? <div className="agent-view-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">{children}</div> : children}
  </EntityCard>;
}
