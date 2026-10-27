import type { Agent } from '../../../state/agents';
import { name } from '../../../state/agents';
import { PlatformIcon, StateBadge } from '../../ui';
import { Reference } from '../Reference';
import { statePresentation } from '../statePresentation';
import { agentState } from './presentation';
export function AgentPlatformChip({ agent, state = agentState(agent), onOpen, disabled, selected }: { agent: Agent; state?: string; onOpen?: () => void; disabled?: boolean; selected?: boolean }) {
  return <Reference onOpen={onOpen} disabled={disabled} selected={selected}><PlatformIcon role="agent" platform={agent.agent} /><span>{name(agent)}</span><StateBadge variant="dot" presentation={statePresentation('agent', state)} /></Reference>;
}
