import type { Agent } from '../../../state/agents';
import type { Status } from '../../../state/types';

export function agentState(agent: Agent, status?: Status) {
  if (agent.adapter?.state === 'preparing') return 'preparing';
  if (agent.adapter?.state === 'failed') return 'connectionError';
  if (agent.installed === false || agent.enabled === false) return 'disabled';
  if (agent.installed === undefined || agent.enabled === undefined) return 'unknown';
  if (agent.agent === 'codex') {
    const state = status?.autoOpenCodex === false ? status.core.appServer.state : status?.core.desktop?.state;
    return state === 'ready' ? 'connected' : state === 'error' ? 'connectionError' : state === 'connecting' ? 'preparing' : 'disconnected';
  }
  return agent.status === 'ready' ? 'connected' : agent.available ? 'agentAvailable' : 'connectionError';
}
