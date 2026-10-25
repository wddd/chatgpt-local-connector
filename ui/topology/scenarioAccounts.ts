import type { AgentActivitySnapshot } from '../types';
import type { Status } from '../state/types';
import type { TopologyAccount } from './accounts';

export function installTopologyAccounts(status: Status, activity: AgentActivitySnapshot): TopologyAccount[] {
  const base = status.ingresses[0].sources![0];
  const accounts: TopologyAccount[] = [
    { id: 'example-personal', provider: 'anthropic', identityKey: 'example-anthropic-personal', alias: 'Personal', sources: ['example-claude-personal', 'example-claude-laptop'], agentProfiles: [{ agent: 'claude', profileId: 'example-profile-personal', kind: 'cli-profile', state: 'signed-in', default: true }] },
    { id: 'example-studio', provider: 'anthropic', identityKey: 'example-anthropic-studio', alias: 'Studio', sources: ['example-claude-studio'], agentProfiles: [{ agent: 'claude', profileId: 'example-profile-studio', kind: 'cli-profile', state: 'signed-in', default: false }] },
    { id: 'example-openai', provider: 'openai', identityKey: 'example-openai', alias: 'Personal', sources: ['example-chatgpt'], agentProfiles: [{ agent: 'codex', profileId: 'example-codex-home', kind: 'codex-home', state: 'signed-in', default: true }] },
    { id: 'example-deepseek', provider: 'deepseek', identityKey: 'example-deepseek', alias: 'Project', sources: [], agentProfiles: [{ agent: 'dsh', profileId: 'example-key', kind: 'api-key', state: 'signed-in', default: true }] },
  ];
  status.ingresses[0].sources = accounts.flatMap(a => a.sources.map(id => ({ ...base, id, product: a.provider === 'openai' ? 'chatgpt' : 'claude', label: a.provider === 'openai' ? 'ChatGPT' : 'Claude' })));
  for (const [agent, group] of Object.entries(activity.agents)) group.sessions.forEach((session, index) => {
    const account = agent === 'claude' ? accounts[index === 1 ? 1 : 0] : agent === 'codex' ? accounts[2] : accounts[3];
    session.agentAccountId = account.id;
    const origin = agent === 'dsh' ? accounts[1] : account;
    session.origin = { accountId: origin.id, sourceId: origin.sources[0] };
    if (session.dispatchSummary) session.dispatchSummary.controlSource = { id: origin.sources[0], kind: origin.provider === 'openai' ? 'chatgpt' : 'claude', label: origin.provider === 'openai' ? 'ChatGPT' : 'Claude' };
  });
  return accounts;
}
