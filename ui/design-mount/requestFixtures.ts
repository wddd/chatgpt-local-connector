import type { AgentInteraction, AgentTimelineEntry } from '../types';
import type { Ingress, OAuthRequest } from '../state/types';
import type { RelayProgress } from '../state/relay';
const question: AgentInteraction = { kind: 'question', summary: 'Choose verification', canRespond: true, method: 'item/tool/requestUserInput', respond: { via: 'act', op: 'codex_respond', args: { id: 'fixture-question' } }, questions: [
  { id: 'plan', question: 'Verification plan', multiSelect: true, isOther: true, options: [{ label: 'Quick', description: 'Check the selected surface' }, { label: 'Complete', description: 'Check every affected surface' }] },
  { id: 'secret', question: 'Access secret', isSecret: true, options: [] },
] };
export const requestFixtures = {
  now: Date.UTC(2026, 0, 1), question,
  permission: { kind: 'permission', title: 'Run verification', summary: 'Review command', command: 'check fixture', cwd: '/sample/private/project', reason: 'Verify the selected changes', canRespond: true, respond: { via: 'act', op: 'codex_respond', args: { id: 'fixture-permission' } } } satisfies AgentInteraction,
  secretReceipt: { id: 'fixture-secret-history', startedAt: '2025-12-31T23:00:00Z', updatedAt: '2025-12-31T23:00:01Z', cursor: 1, turnId: 'fixture-turn', type: 'interaction', status: 'completed', interaction: question, response: { resolvedAt: '2025-12-31T23:00:01Z', result: { answers: { secret: { answers: ['secret-must-not-render'] } } }, origin: { controlSource: 'ARC' } } } satisfies AgentTimelineEntry,
  authorization: { id: 'fixture-authorization', status: 'pending', clientName: 'Sample client', product: 'claude', pairingCode: '246810', expiresAt: 1767226200, redirectUri: '', resource: '' } satisfies OAuthRequest,
  ingress: { id: 'fixture-ingress', name: 'Sample connection', toolPolicy: 'all' } as Ingress,
  deployment: { phase: 'failed', action: 'create', accounts: [{ id: 'fixture-account', name: 'Sample workspace' }], reason: 'Account choice required' } satisfies RelayProgress,
};
