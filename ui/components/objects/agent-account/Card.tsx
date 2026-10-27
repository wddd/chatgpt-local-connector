import type { ReactNode } from 'react';
import type { ProviderAccount, AccountAgentProfile } from '../../../types';
import type { Agent } from '../../../state/agents';
import { StateBadge, EntityCard, SectionHeader, Notice } from '../../ui';
import { AgentQuotaIcon } from '../../../subscriptions/QuotaRing';
import { AccountIdentity, accountProfiles } from './identity';
import { statePresentation } from '../statePresentation';
import { AgentProfileRow } from './Row';
import { cn } from '../../../lib/utils';
export function AgentAccountCard({ account, agent, frame = 'detail', title, icon, headerActions, titleActions, secondary, children, footer, danger, error, loading, busy, onDefault, onReauth, showProfiles = true }: {
  account: ProviderAccount; agent?: Agent; frame?: 'detail' | 'panel'; title?: ReactNode; icon?: ReactNode; headerActions?: ReactNode; titleActions?: ReactNode; secondary?: ReactNode; children?: ReactNode; footer?: ReactNode; danger?: ReactNode; error?: string; loading?: boolean; busy?: boolean;
  onDefault?: (profile: AccountAgentProfile) => void; onReauth?: (profile: AccountAgentProfile) => void; showProfiles?: boolean;
}) {
  const unavailable = !!account.removedAt;
  const body = <>
    {unavailable && <StateBadge presentation={statePresentation('account', 'removed')} />}
    {error && <Notice>{error}</Notice>}
    {frame === 'panel' && <AccountIdentity account={account} />}
    {showProfiles && accountProfiles(account, agent?.agent).map((profile, index) => <AgentProfileRow key={`${profile.agent}:${profile.profileId}`} profile={profile} ordinal={index + 1} busy={busy || unavailable} onDefault={onDefault} onReauth={onReauth} />)}
    {children}
  </>;
  return <EntityCard className={cn('agent-account-card rounded-none border-0 bg-transparent p-0', frame === 'panel' ? 'flex min-h-0 flex-1 flex-col gap-0' : 'gap-4')} aria-busy={loading} footer={footer} danger={danger}>
    <SectionHeader className={frame === 'panel' ? 'dialog-header agent-panel-header' : 'gap-3 [&_.section-header-copy]:grid [&_.section-header-copy]:gap-1'} level={2} title={title ?? account.alias} titleAsChild={!!title && typeof title !== 'string'} leading={icon ?? (agent && <AgentQuotaIcon agent={agent.agent} quota={account.quota ?? null} dual />)} titleProps={{ className: 'activity-panel-title', tabIndex: -1 }} titleActions={titleActions} actions={headerActions} secondary={secondary ?? <AccountIdentity account={account} />} />
    {frame === 'panel' ? <div className="agent-view-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">{body}</div> : body}
  </EntityCard>;
}
