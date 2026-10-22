import { connector } from './state/connector';
import { agents, type Agent } from './state/agents';
import { acceptActivity } from './state/activity';
import { tasks } from './state/tasks';
import { permissions } from './state/permissions';
import { subscriptions } from './state/subscriptions';
import { acceptPreferences } from './state/store';
import { openSnapshotPanel, settledViewModel, type PanelRequest } from './acceptance';
import type { AgentActivitySnapshot, AgentActivitySession } from './types';
import type { Status } from './state/types';
import config from '../native/src/ingress/config.json';

type Fixture = { theme: 'light' | 'dark'; language: 'en' | 'zh-CN'; agents: string[]; tasks: { agent: string; phase: AgentActivitySession['phase']; title: string; headline: string; approval?: boolean }[]; panel?: PanelRequest };
const fixtures = import.meta.glob('../tooling/acceptance/scenarios/*.json', { import: 'default' });
let responses: Record<string, unknown> = {};
export function scenarioResponse(path: string, method: string): unknown {
  if (path === 'preferences' || path === 'preferences/import') return responses.preferences;
  if (method !== 'GET') throw new Error('SCENARIO_READ_ONLY');
  if (Object.hasOwn(responses, path)) return structuredClone(responses[path]);
  if (path.startsWith('tasks/runtime/')) return { runtimeStatus: 'active', observedAt: new Date().toISOString() };
  throw new Error(`SCENARIO_ROUTE_UNAVAILABLE: ${path}`);
}
export async function installScenario(name: string) {
  const load = fixtures[`../tooling/acceptance/scenarios/${name}.json`];
  if (!load) throw new Error(`Unknown acceptance scenario: ${name}`);
  const fixture = await load() as Fixture;
  localStorage.setItem('arc-page', 'overview');
  const preferences = { theme: fixture.theme, language: fixture.language, 'arc.agent-order': JSON.stringify(fixture.agents) };
  acceptPreferences(preferences);
  const now = new Date().toISOString();
  const defaults = Object.fromEntries(Object.entries(config.fields).map(([key, field]) => [key, field.default]));
  const status = {
    diagnostics: { findings: [] }, ingresses: [{ id: 'fixture-source', name: 'Claude', controlSource: 'claude', transport: 'local', state: 'ready', running: true, error: '', enabled: true, auth: 'local', toolPolicy: 'all', config: { ...defaults, configured: true }, url: '', oauth: { pending: [], grants: [] }, verification: { verifiedAt: now } }],
    ingressSummary: { running: 1, ready: 1, total: 1 }, taskApprovalEnabled: true, autoOpenCodex: true, notificationsEnabled: false,
    core: { backendSession: 'acceptance-fixture', version: 'fixture', desktop: { state: 'ready', supported: true, message: '' }, appServer: { state: 'ready', resources: {} }, account: { state: 'ready' }, resources: {}, activeTurns: fixture.tasks.length, activeWrites: 0, pendingInteractions: 0, logs: [] },
    deviceName: 'Acceptance', platform: 'darwin', version: 'fixture', connector: { state: 'ready' }, tunnel: { state: 'ready' }, config: defaults, logs: [],
  } as unknown as Status;
  const inventory: Agent[] = fixture.agents.map(agent => ({ agent, installed: true, available: true, enabled: true, status: 'ready', version: 'fixture' }));
  const activity: AgentActivitySnapshot = { observedAt: now, activeAgents: fixture.agents, agents: Object.fromEntries(fixture.agents.map(a => [a, { sessions: [] }])) };
  fixture.tasks.forEach((task, index) => {
    activity.agents[task.agent].sessions.push({ id: `fixture-task-${index}`, source: task.agent === 'codex' ? 'codex-thread' : 'arc-task', title: task.title, headline: task.headline, phase: task.phase,
      project: '/workspace/acceptance', phaseSince: now, turnStartedAt: now, startedAt: now, timeline: true, recentSteps: ['thinking', 'command', 'file'],
      ...(task.approval ? { interaction: { kind: 'permission' as const, summary: 'Read README.md', command: 'cat README.md', canRespond: true, respond: { via: 'act' as const, op: 'codex_respond' as const, args: {} } } } : {}),
    });
  });
  const records = fixture.tasks.map((task, index) => ({ requestId: `fixture-request-${index}`, threadId: `fixture-task-${index}`, state: task.approval ? 'awaiting-approval' : 'completed', createdAt: now, updatedAt: now,
    origin: { ingressId: 'fixture-source' }, approval: { decision: 'automatic', source: 'remote', at: now }, task: { kind: 'create', title: task.title, prompt: task.headline, input: [], directory: '/workspace/acceptance', settings: {} } }));
  const permissionData = { items: [], observedAt: now };
  const subscriptionData = { instanceId: 'fixture', revision: 1, settings: { enabled: false, refreshMinutes: 30, agentProviders: {} }, providers: [] };
  responses = { status, agents: { agents: inventory }, 'agents/activity': activity, tasks: { records }, permissions: permissionData, subscriptions: subscriptionData, preferences, relay: { relays: [] } };
  connector.set({ status, busy: '', loading: false, error: '', feedback: { text: '', error: false } });
  agents.set({ items: inventory, loaded: true, loading: false, saving: '', error: '' });
  acceptActivity(activity); tasks.set({ records, loading: false, error: '' });
  permissions.set({ data: permissionData, loading: false, error: '' });
  subscriptions.set({ snapshot: subscriptionData, error: '' });
  return async () => {
    openSnapshotPanel(fixture.panel);
    await settledViewModel();
    document.documentElement.dataset.scenarioReady = name;
  };
}
