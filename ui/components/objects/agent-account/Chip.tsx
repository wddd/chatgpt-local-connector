import type { ProviderAccount } from '../../../types';
import { name } from '../../../state/agents';
import { PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { Reference } from '../Reference';
import { accountProfiles } from './identity';
export function AgentAccountChip({ account, agent, onOpen, disabled, selected }: { account: ProviderAccount; agent: string; onOpen?: () => void; disabled?: boolean; selected?: boolean }) {
  const profiles = accountProfiles(account, agent);
  return <Reference onOpen={profiles.length ? onOpen : undefined} disabled={disabled || !!account.removedAt} selected={selected}><PlatformIcon role="agent" platform={agent} /><span>{name({ agent })} · {account.alias}</span>{[...new Set(profiles.map(profile => profile.state))].map(state => <StateBadge key={state} variant="compact" presentation={statePresentation('profile', state)} />)}</Reference>;
}
