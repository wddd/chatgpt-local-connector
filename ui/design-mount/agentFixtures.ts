import { fixtures } from './fixtures';
import type { Agent } from '../state/agents';
import type { ProviderAccount } from '../types';
import type { ControlSource, Ingress, OAuthRequest } from '../state/types';
const agent: Agent = { agent: 'claude', installed: true, enabled: true, available: true, status: 'ready', version: '2.0.0' };
const source: ControlSource = { ...fixtures.sources[0], id: 'agent-source', label: 'Shared source', product: 'claude', ingressId: 'agent-connection', credential: { type: 'oauth-grant', grantId: 'current' }, state: 'connected' };
const request: OAuthRequest = { id: 'pending', sourceId: source.id, switchSourceId: source.id, clientName: 'Pending authorization', product: 'claude', status: 'pending', expiresAt: fixtures.now / 1000 + 3600, redirectUri: '', resource: '' };
const ingress: Ingress = { ...fixtures.ingresses[0], id: source.ingressId, name: 'Shared connection', oauth: { grants: [{ id: 'current', clientName: 'Current authorization', clientId: 'current-client', connectedAt: fixtures.now / 1000, registeredAt: fixtures.now / 1000 }, { id: 'older', clientName: 'Old authorization', clientId: 'older-client', connectedAt: fixtures.now / 1000 - 1000, registeredAt: fixtures.now / 1000 - 1000 }], pending: [request] } };
const account: ProviderAccount = { ...fixtures.accounts[0], id: 'agent-account', alias: 'Shared identity', email: 'private@example.test', orgName: 'Private organization', sources: [source.id], agentProfiles: [
  { agent: 'claude', profileId: 'profile-one', kind: 'cli-profile', state: 'signed-in', default: true },
  { agent: 'claude', profileId: 'profile-two', kind: 'cli-profile', state: 'signed-in', default: false },
  { agent: 'claude', profileId: 'profile-three', kind: 'cli-profile', state: 'signed-out', default: false },
] };
export const agentFixtures = { agent, account, source, ingress, request, quotaStates: fixtures.quotaStates };
