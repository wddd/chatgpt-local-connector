import type { ReactNode } from 'react';
import type { ProviderAccount, AccountAgentProfile } from '../../../types';
import type { ControlSource } from '../../../state/types';
import type { ProviderSnapshot } from '../../../subscriptions/types';
import { name } from '../../../state/agents';
import { accountPlatform } from '../../../accountPresentation';
import { t } from '../../../i18n';
import { EntityRow, PlatformIcon, StateBadge, Button, Tag } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { statePresentation } from '../statePresentation';
import { accountProfiles } from './identity';

export function AgentAccountRow({ account, agent, sources = [], providers = [], onOpen, selected, disabled, actions }: { account: ProviderAccount; agent?: string; sources?: ControlSource[]; providers?: ProviderSnapshot[]; onOpen?: () => void; selected?: boolean; disabled?: boolean; actions?: ReactNode }) {
  const platform = accountPlatform(account, sources, providers), profiles = accountProfiles(account, agent);
  return <EntityRow className="[&_.entity-row-secondary]:grid [&_.entity-row-secondary]:gap-1 [&_.entity-row-title]:wrap-anywhere" data-hover-target={account.id} leading={<span className="inline-grid size-9 shrink-0 place-items-center"><PlatformIcon size={36} role={agent ? 'agent' : platform.source ? 'source' : 'agent'} platform={agent ?? platform.source ?? platform.agent} /></span>} title={account.alias} secondary={<>{account.email && <Sensitive>{account.email}</Sensitive>}{!agent && <span className="flex flex-wrap items-center gap-1.5">{!!account.sources.length && <Tag tone="source">SRC</Tag>}{!!profiles.length && <Tag tone="agent">AGENT</Tag>}</span>}</>} state={<>{[...new Set(profiles.map(profile => profile.state))].map(state => <StateBadge key={state} variant="dot" presentation={statePresentation('profile', state)} />)}{!agent && account.notifications.state === 'not-bound' && <StateBadge variant="dot" presentation={statePresentation('account', 'attention')} />}</>} onClick={onOpen} selected={selected} disabled={disabled || !!account.removedAt} actions={actions} />;
}

export function AgentProfileRow({ profile, ordinal, busy, onReauth }: { profile: AccountAgentProfile; ordinal: number; busy?: boolean; onReauth?: (profile: AccountAgentProfile) => void }) {
  const nativeLogin = profile.agent === 'claude' || profile.agent === 'codex' && profile.profileId === 'codex-home';
  const title = `${name(profile)} · ${t('accounts.profileNumber', { count: ordinal })}`;
  return <EntityRow className="agent-profile-row flex-wrap gap-2 [&>.entity-row]:basis-72 [&>.actions]:max-w-full [&_.entity-row-copy]:basis-30 [&_.entity-row-title]:wrap-anywhere [&_.status]:max-w-full [&_.status]:whitespace-normal" leading={<PlatformIcon size={20} role="agent" platform={profile.agent} />} title={title} secondary={<>{profile.kind}{onReauth && !nativeLogin && <> · {t('accounts.nativeAuth')}</>}</>} state={<StateBadge presentation={statePresentation('profile', profile.state)} />} actions={<>
    {profile.default && <Tag>{t('accounts.default')}</Tag>}
    {onReauth && nativeLogin && <Button variant="link" disabled={busy} aria-label={`${title} · ${t('accounts.reauth')}`} onClick={() => onReauth(profile)}>{t('accounts.reauth')}</Button>}
  </>} />;
}
