import type { ReactNode } from 'react';
import type { ProviderAccount, AccountAgentProfile } from '../../../types';
import type { Agent } from '../../../state/agents';
import { StateBadge, EntityCard, SectionHeader, Notice } from '../../ui';
import { AgentQuotaIcon } from '../../../subscriptions/QuotaRing';
import { AccountIdentity, accountProfiles } from './identity';
import { statePresentation } from '../statePresentation';
import { AgentProfileRow } from './Row';
import { cn } from '../../../lib/utils';
export function AgentAccountCard({ account, agent, frame = 'detail', title, icon, headerActions, titleActions, secondary, children, footer, danger, error, loading, busy, onReauth, showProfiles = true }: {
  account: ProviderAccount; agent?: Agent; frame?: 'detail' | 'panel'; title?: ReactNode; icon?: ReactNode; headerActions?: ReactNode; titleActions?: ReactNode; secondary?: ReactNode; children?: ReactNode; footer?: ReactNode; danger?: ReactNode; error?: string; loading?: boolean; busy?: boolean;
  onReauth?: (profile: AccountAgentProfile) => void; showProfiles?: boolean;
}) {
  const unavailable = !!account.removedAt;
  const body = <>
    {unavailable && <StateBadge presentation={statePresentation('account', 'removed')} />}
    {error && <Notice>{error}</Notice>}
    {frame === 'panel' && <AccountIdentity account={account} />}
    {showProfiles && accountProfiles(account, agent?.agent).map((profile, index) => <AgentProfileRow key={`${profile.agent}:${profile.profileId}`} profile={profile} ordinal={index + 1} busy={busy || unavailable} onReauth={onReauth} />)}
    {children}
  </>;
  return <EntityCard className={cn('agent-account-card rounded-none border-0 bg-transparent p-0', frame === 'panel' ? 'flex min-h-0 flex-1 flex-col gap-0' : 'gap-4')} aria-busy={loading} footer={footer} danger={danger}>
    <SectionHeader className={frame === 'panel' ? 'dialog-header flex shrink-0 items-center justify-between gap-2.5 border-0 px-3.5 py-4 [&_h2]:min-w-0 [&_h2]:flex-1 [&_h2]:text-left [&_h2]:text-base [&_h2]:font-semibold [&_h2]:wrap-anywhere [&_.actions]:shrink-0 agent-panel-header [&_.section-header-copy]:flex [&_.section-header-copy]:min-w-0 [&_.section-header-copy]:flex-1 [&_.section-header-copy]:flex-col [&_.section-header-copy]:gap-0.5 [&_.activity-panel-title]:block [&_.activity-panel-title]:w-auto [&_.activity-panel-title]:flex-initial [&_.activity-panel-title]:truncate [&_.agent-quota-icon]:[--agent-quota-size:--spacing(11)]' : 'gap-3 [&_.section-header-copy]:grid [&_.section-header-copy]:gap-1'} level={2} title={title ?? account.alias} titleAsChild={!!title && typeof title !== 'string'} leading={icon ?? (agent && <AgentQuotaIcon agent={agent.agent} quota={account.quota ?? null} dual />)} titleProps={{ className: 'activity-panel-title min-w-0 truncate text-sm leading-5 font-semibold', tabIndex: -1 }} titleActions={titleActions} actions={headerActions} secondary={secondary ?? <AccountIdentity account={account} />} />
    {frame === 'panel' ? <div className="agent-view-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">{body}</div> : body}
  </EntityCard>;
}
