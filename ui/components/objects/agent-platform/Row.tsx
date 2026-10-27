import type { ReactNode } from 'react';
import { name, compactAgentVersion, type Agent } from '../../../state/agents';
import { t } from '../../../i18n';
import { EntityRow, PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { agentState } from './presentation';
export function AgentPlatformRow({ agent, onOpen, actions, disabled, selected }: { agent: Agent; onOpen?: () => void; actions?: ReactNode; disabled?: boolean; selected?: boolean }) {
  return <EntityRow leading={<PlatformIcon role="agent" platform={agent.agent} />} title={name(agent)} secondary={agent.adapter?.error || agent.discoveryError || (agent.installed ? compactAgentVersion(agent.version) : t('agentNotInstalled'))} state={<StateBadge presentation={statePresentation('agent', agentState(agent))} />} onClick={onOpen} actions={actions} disabled={disabled} selected={selected} />;
}
