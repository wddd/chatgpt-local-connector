import type { SrcConversation } from '../srcConversations';
import { baseFixtures } from './baseFixtures';
import { agentFixtures } from './agentFixtures';

const conversation: SrcConversation = {
  accountId: agentFixtures.account.id, kind: 'chat', id: 'example-conversation', title: 'Review the project plan', url: 'https://claude.ai/chat/example-conversation',
  basis: 'observed', aliases: [], firstSeenAt: new Date(baseFixtures.now).toISOString(), lastSeenAt: new Date(baseFixtures.now).toISOString(), lastActiveAt: null,
  taskRefs: [{ agent: 'codex', id: 'example-task', title: 'Review project files', basis: 'correlated' }],
};
export const panelFixtures = {
  conversations: [conversation, { ...conversation, id: 'without-task', taskRefs: [] }, { ...conversation, id: 'multiple-tasks', taskRefs: [...conversation.taskRefs, { agent: 'claude', id: 'second-task', basis: 'manual' as const }] }],
  source: { product: 'claude', sources: baseFixtures.sources, accounts: baseFixtures.accounts, ingresses: baseFixtures.ingresses },
  agent: agentFixtures.agent, account: agentFixtures.account,
};
