import { onboarding, connectionSetup, connectionSwitch, type ConnectionSwitch, type SourceSetup, type ConnectionSetup } from './state/onboarding';
import { navigation, type Page } from './state/navigation';
import type { RelayProgress } from './state/relay';
import { connector } from './state/connector';
import { agents, type Agent } from './state/agents';
import { acceptActivity } from './state/activity';
import { tasks } from './state/tasks';
import { permissions } from './state/permissions';
import { subscriptions } from './state/subscriptions';
import { acceptPreferences } from './state/store';
import { openSnapshotPanel, settledViewModel, type PanelRequest } from './acceptance';
import type { AgentActivitySnapshot, AgentActivitySession, AgentConversation, AgentTimeline, AgentTimelineEntry } from './types';
import type { Snapshot } from './subscriptions/types';
import { selectAgentPanel } from './state/overviewPanels';
import type { Status } from './state/types';
import config from '../native/src/ingress/config.json';

type Fixture = { panelHistory?: boolean; quota?: boolean; quotaDisplay?: 'remaining' | 'used'; resetDisplay?: 'countdown' | 'time' } & { timeline?: 'multi-turn'; detailTask?: number; bubbles?: { density?: 'compact' | 'standard' | 'detailed'; width?: 'narrow' | 'medium' | 'wide'; autoCompact?: boolean }; theme: 'light' | 'dark'; language: 'en' | 'zh-CN'; agents: string[]; tasks: { agent: string; phase: AgentActivitySession['phase']; title: string; headline: string; approval?: boolean; completed?: boolean; elapsedSeconds?: number }[]; panel?: PanelRequest; remoteLink?: { empty?: boolean; pending?: boolean; connected?: boolean; joined?: boolean; local?: boolean; switching?: boolean; disconnected?: boolean; switched?: boolean }; switchFlow?: ConnectionSwitch; remoteSourceId?: string; sourceSetup?: SourceSetup; connectionSetup?: ConnectionSetup; page?: Page; remoteConnectionId?: string; relayProgress?: RelayProgress };
const fixtures = import.meta.glob('../tooling/acceptance/scenarios/*.json', { import: 'default' });
let responses: Record<string, unknown> = {};
let conversations: Record<string, AgentConversation[]> = {};
export function scenarioResponse(path: string, method: string, body?: unknown): unknown {
  if (path === 'preferences' || path === 'preferences/import') return responses.preferences;
  if (path === 'agents/conversations/timeline' && method === 'POST') {
    const timeline = responses[`agents/timeline/${(body as { id: string }).id}`];
    if (timeline) return structuredClone(timeline);
    throw new Error('SCENARIO_TIMELINE_UNAVAILABLE');
  }
  if (path === 'agents/conversations' && method === 'POST') {
    const { agent, cursor, limit = 20 } = body as { agent: string; cursor?: string; limit?: number };
    const start = Number(cursor?.replace('fixture-page-', '') ?? 0);
    const rows = conversations[agent] ?? [], size = Math.max(1, Math.min(50, limit));
    return { data: structuredClone(rows.slice(start, start + size)), nextCursor: start + size < rows.length ? `fixture-page-${start + size}` : null,
      scope: agent === 'codex' ? 'native-unarchived' : 'arc-tasks' };
  }
  if (method !== 'GET') throw new Error('SCENARIO_READ_ONLY');
  const route = path.split('?')[0];
  if (Object.hasOwn(responses, route)) return structuredClone(responses[route]);
  if (path.startsWith('tasks/runtime/')) return { runtimeStatus: 'active', observedAt: new Date().toISOString() };
  throw new Error(`SCENARIO_ROUTE_UNAVAILABLE: ${path}`);
}
export async function installScenario(name: string) {
  const load = fixtures[`../tooling/acceptance/scenarios/${name}.json`];
  if (!load) throw new Error(`Unknown acceptance scenario: ${name}`);
  const fixture = await load() as Fixture;
  localStorage.setItem('arc-page', 'overview');
  const preferences = { theme: fixture.theme, language: fixture.language, 'arc.agent-order': JSON.stringify(fixture.agents), 'quota-display': fixture.quotaDisplay ?? 'remaining', 'quota-reset-display': fixture.resetDisplay ?? 'countdown', 'task-bubble-density': fixture.bubbles?.density ?? 'standard', 'task-bubble-width': fixture.bubbles?.width ?? 'medium', 'task-bubble-auto-compact': fixture.bubbles?.autoCompact === false ? 'off' : 'on' };
  acceptPreferences(preferences);
  const now = new Date().toISOString();
  const defaults = Object.fromEntries(Object.entries(config.fields).map(([key, field]) => [key, field.default]));
  const status = {
    diagnostics: { findings: [] }, ingresses: [{ sources: [{ id: 'fixture-source', ingressId: 'fixture-source', credential: { type: 'local' }, product: 'claude', platform: 'anthropic', label: 'Claude', createdAt: now, connectedAt: 1, lastSeenAt: 1, state: 'connected' }], id: 'fixture-source', name: 'Claude', controlSource: 'claude', transport: 'local', state: 'ready', running: true, error: '', enabled: true, auth: 'local', toolPolicy: 'all', config: { ...defaults, configured: true }, url: '', oauth: { pending: [], grants: [] }, verification: { verifiedAt: now } }],
    ingressSummary: { running: 1, ready: 1, total: 1 }, taskApprovalEnabled: true, autoOpenCodex: true, notificationsEnabled: false,
    core: { backendSession: 'acceptance-fixture', version: 'fixture', desktop: { state: 'ready', supported: true, message: '' }, appServer: { state: 'ready', resources: {} }, account: { state: 'ready' }, resources: {}, activeTurns: fixture.tasks.length, activeWrites: 0, pendingInteractions: 0, logs: [] },
    deviceName: 'Acceptance', platform: 'darwin', version: 'fixture', connector: { state: 'ready' }, tunnel: { state: 'ready' }, config: defaults, logs: [],
  } as unknown as Status;
  if (fixture.remoteLink) {
    const base = status.ingresses[0];
    const remote = fixture.remoteLink;
    const source = { ...base.sources![0], id: 'source-personal', ingressId: 'relay-main', credential: { type: 'oauth-grant' as const, grantId: 'grant-personal' }, label: 'Claude · Personal' };
    const pendingSource = { ...source, id: 'source-new', label: 'Claude', credential: { type: 'oauth-grant' as const, grantId: 'request-new' }, connectedAt: remote.connected ? 1 : null, lastSeenAt: remote.connected ? 1 : null };
    status.ingresses = remote.empty ? [] : [
      { ...base, id: 'relay-main', transport: 'relay', auth: 'oauth', name: 'My relay', url: 'https://relay.example.com/mcp', sources: [source, ...(remote.pending || remote.connected ? [pendingSource] : [])],
        oauth: { grants: [{ id: 'grant-personal', clientName: 'Claude', clientId: 'client-personal', connectedAt: 1, registeredAt: 1 }], pending: remote.pending ? [{ id: 'request-new', sourceId: 'source-new', product: 'claude', clientName: 'Claude', redirectUri: 'https://claude.ai/api/mcp/auth_callback', resource: 'https://relay.example.com/mcp', pairingCode: '4F7K', status: 'pending' }] : [] } },
      { ...base, id: 'secure-tunnel', name: 'ChatGPT tunnel', transport: 'openai-tunnel', controlSource: 'chatgpt', auth: 'openai', url: '', sources: [] },
    ];
    if (remote.local) status.ingresses = [{ ...base, id: 'local-claude-code', name: 'Claude Code', sources: [{ ...base.sources![0], id: 'local-source', ingressId: 'local-claude-code', connectedAt: null, lastSeenAt: null }] }];
  }
  const sources = status.ingresses.flatMap(i => i.sources ?? []);
  if (fixture.remoteLink?.switching || fixture.remoteLink?.disconnected) {
    const old = status.ingresses[0], source = sources.find(s => s.id === 'source-personal')!;
    const target = { ...old, id: 'tunnel-next', name: 'Cloudflare Tunnel', transport: 'https', url: 'https://tunnel.example.com/mcp', sources: [], oauth: { pending: [], grants: [] } } as typeof old;
    const peer = { ...source, id: 'source-bot', label: 'Grok Bot', product: 'grok-bot', platform: 'xai', credential: { type: 'oauth-grant' as const, grantId: 'grant-bot' } };
    sources.push(peer); old.sources!.push(peer);
    const occupied = status.ingresses.find(i => i.id === 'secure-tunnel')!;
    occupied.sources = [{ ...source, id: 'source-secure', ingressId: occupied.id, label: 'ChatGPT', product: 'chatgpt', platform: 'openai', credential: { type: 'ingress' } }];
    sources.push(...occupied.sources);
    status.ingresses.push(target);
    if (fixture.switchFlow && fixture.switchFlow.step !== 'connection') {
      source.pendingSwitch = { ingressId: target.id, expiresAt: Math.floor(Date.now() / 1000) + 300, ...(fixture.switchFlow.step === 'approval' ? { requestId: 'request-switch' } : {}) };
      if (fixture.switchFlow.step === 'approval') {
        const pending = { ...source, id: 'source-switch', switchSourceId: source.id, ingressId: target.id, credential: { type: 'oauth-grant' as const, grantId: 'request-switch' }, pendingSwitch: undefined, connectedAt: null, lastSeenAt: null, state: 'disconnected' as const };
        sources.push(pending); target.sources = [pending];
        target.oauth!.pending = [{ id: 'request-switch', sourceId: pending.id, switchSourceId: source.id, product: source.product, clientName: 'Claude', redirectUri: 'https://claude.ai/api/mcp/auth_callback', resource: target.url, pairingCode: '4F7K', status: 'pending' }];
      }
    }
    if (fixture.remoteLink?.switched) {
      old.sources = old.sources!.filter(s => s.id !== source.id);
      source.ingressId = target.id; target.sources = [source];
    }
    if (fixture.remoteLink?.disconnected) {
      for (const s of sources.filter(s => s.ingressId === old.id)) { s.state = 'disconnected'; s.connectionRemoved = true; s.connectionName = old.name; }
      status.ingresses = status.ingresses.filter(i => i.id !== old.id);
    }
  }
  const inventory: Agent[] = fixture.agents.map(agent => ({ agent, installed: true, available: true, enabled: true, status: 'ready', version: 'fixture' }));
  const activity: AgentActivitySnapshot = { observedAt: now, activeAgents: fixture.agents, agents: Object.fromEntries(fixture.agents.map(a => [a, { sessions: [] }])) };
  fixture.tasks.forEach((task, index) => {
    activity.agents[task.agent].sessions.push({ id: `fixture-task-${index}`, source: task.agent === 'codex' ? 'codex-thread' : 'arc-task', title: task.title, headline: task.headline, phase: task.phase,
      turnId: `fixture-turn-${index}-${fixture.timeline ? 2 : 1}`, project: '/workspace/acceptance', phaseSince: now, turnStartedAt: new Date(Date.parse(now) - (task.elapsedSeconds ?? 83) * 1000).toISOString(), startedAt: now, timeline: true, recentSteps: ['thinking', 'command', 'file'],
      recentContent: ['Reviewed project files', task.headline],
      dispatchSummary: { controlSource: { id: 'fixture-source', label: 'Claude', kind: 'claude' }, model: 'gpt-6.1-sol', effort: 'high', serviceTier: 'priority' },
      ...(task.approval ? { interaction: { kind: 'permission' as const, summary: 'Read README.md', command: 'cat README.md', canRespond: true, respond: { via: 'act' as const, op: 'codex_respond' as const, args: {} } } } : {}),
    });
  });
  const timelines: Record<string, AgentTimeline> = {};
  fixture.tasks.forEach((task, taskIndex) => {
    const session = activity.agents[task.agent].sessions.find(session => session.id === `fixture-task-${taskIndex}`)!;
    const entries: AgentTimelineEntry[] = [];
    const summaries: NonNullable<AgentTimeline['turnDispatchSummaries']> = {};
    const turnStatuses: Record<string, string> = {};
    const count = fixture.timeline ? 2 : 1;
    for (let turnIndex = 1; turnIndex <= count; turnIndex++) {
      const turnId = `fixture-turn-${taskIndex}-${turnIndex}`;
      const live = !task.completed && turnIndex === count;
      turnStatuses[turnId] = live ? 'running' : 'completed';
      const start = Date.parse(session.turnStartedAt!) - (count - turnIndex) * 180000;
      const rows: (Pick<AgentTimelineEntry, 'type' | 'status'> & Partial<AgentTimelineEntry>)[] = [
        { type: 'user', status: 'completed', text: turnIndex === 1 ? 'Review the project and check the configuration.\n\nKeep the existing behavior while making the requested changes.' : 'Apply the changes and run the project checks.' },
        { type: 'thinking', status: 'completed', text: 'I will read the current configuration and preserve its documented behavior.', durationMs: 3200 },
        { type: 'command', status: 'completed', command: 'cat package.json', cwd: '/workspace/acceptance', output: { state: 'available', text: '{ "scripts": { "check": "tsc --noEmit" } }', truncated: false, sha256: 'fixture', hashScope: 'excerpt' }, durationMs: 300, exitCode: 0 },
        { type: 'thinking', status: 'completed', text: 'The existing check command covers the changed TypeScript files.', durationMs: 2800 },
        { type: 'text', status: 'completed', text: 'The project configuration is ready. I am applying the change next.' },
        { type: 'file', status: 'completed', path: '/workspace/acceptance/config.json', operation: 'edit', changes: [{ path: '/workspace/acceptance/config.json', operation: 'edit' }], durationMs: 1400 },
        { type: 'tool', status: 'completed', title: 'Read project metadata', durationMs: 600 },
        { type: 'plan', status: 'completed', plan: [{ content: { state: 'available', text: 'Verify project changes', truncated: false, sha256: 'fixture', hashScope: 'excerpt' }, status: live ? 'in_progress' : 'completed' }] },
        task.approval && live
          ? { type: 'interaction', status: 'pending', interaction: session.interaction }
          : { type: 'command', status: live ? 'running' : 'completed', command: 'npm run check', cwd: '/workspace/acceptance', ...(live ? {} : { durationMs: 1700, exitCode: 0 }) },
      ];
      if (!live) rows.push({ type: 'text', status: 'completed', phase: 'final_answer', text: 'The requested changes are complete.\n\n| Check | Result |\n| --- | --- |\n| Configuration | Updated |\n| TypeScript | Passed |\n\n- Preserved existing behavior.\n- Verified the changed files.' });
      for (const [index, row] of rows.entries()) {
        const at = new Date(start + index * 4000).toISOString();
        entries.push({ id: `${turnId}-entry-${index}`, turnId, cursor: entries.length + 1, position: entries.length,
          startedAt: at, updatedAt: at, ...(row.status === 'completed' ? { endedAt: new Date(Date.parse(at) + (row.durationMs ?? 1000)).toISOString() } : {}), ...row });
      }
      summaries[turnId] = turnIndex === 1 && count > 1
        ? { controlSource: { kind: 'local-cli' }, model: 'gpt-5.6-sol', effort: 'medium' }
        : session.dispatchSummary!;
    }
    timelines[`agents/timeline/${session.id}`] = { sessionId: session.id, status: task.completed ? 'completed' : 'running', entries,
      cursor: entries.length, executionEvidence: true, coverage: { state: 'complete', truncated: false },
      dispatchSummary: session.dispatchSummary, turnDispatchSummaries: summaries, turnStatuses };
  });
  conversations = Object.fromEntries(fixture.agents.map(agent => {
    const current = activity.agents[agent].sessions.map(session => ({ id: session.id, source: session.source as AgentConversation['source'], title: session.title,
      project: session.project, createdAt: session.startedAt ?? null }));
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const history: AgentConversation[] = fixture.panelHistory ? Array.from({ length: 24 }, (_, index) => {
      const id = `fixture-history-${agent}-${index}`, title = `Review project change ${index + 1}`;
      const start = index < 3 ? Math.max(today.getTime(), Date.parse(now) - (index + 1) * 60000) : today.getTime() - (index - 2) * 86400000;
      const createdAt = new Date(start).toISOString(), endedAt = new Date(start + 83000).toISOString(), turnId = `${id}-turn`;
      timelines[`agents/timeline/${id}`] = { sessionId: id, status: 'completed', entries: [
        { id: `${id}-prompt`, turnId, type: 'user', status: 'completed', startedAt: createdAt, updatedAt: createdAt, text: title, cursor: 1, position: 0 },
        { id: `${id}-answer`, turnId, type: 'text', status: 'completed', phase: 'final_answer', startedAt: endedAt, updatedAt: endedAt, endedAt, text: 'The project changes have been reviewed.', cursor: 2, position: 1 },
      ], cursor: 2, executionEvidence: true, coverage: { state: 'complete', truncated: false }, turnStatuses: { [turnId]: 'completed' } };
      return { id, source: agent === 'codex' ? 'codex-thread' : 'arc-task', title, project: '/workspace/acceptance', createdAt };
    }) : [];
    return [agent, [...current, ...history]];
  }));
  const records = fixture.tasks.map((task, index) => ({ requestId: `fixture-request-${index}`, threadId: `fixture-task-${index}`, state: task.approval ? 'awaiting-approval' : 'completed', createdAt: now, updatedAt: now,
    origin: { ingressId: 'fixture-source', sourceId: 'fixture-source' }, approval: { decision: 'automatic', source: 'remote', at: now }, task: { kind: 'create', title: task.title, prompt: task.headline, input: [], directory: '/workspace/acceptance', settings: {} } }));
  const permissionData = { items: [], observedAt: now };
  const subscriptionData: Snapshot = { instanceId: 'fixture', revision: 1, settings: { enabled: !!fixture.quota, refreshMinutes: 30, agentProviders: {} }, providers: fixture.quota ? [{
    providerId: 'codex', agentId: 'codex', agentIds: ['codex'], name: 'ChatGPT', eligible: true, state: 'ready', refreshing: false,
    observedAt: new Date(Date.parse(now) - 120000).toISOString(), blockedPoolIds: [], hasCredential: true, acceptsKey: false, displayWindowId: 'weekly',
    windows: [
      { id: 'five-hour', poolId: 'main', label: 'five_hour', usedPercent: 37, resetsAt: new Date(Date.parse(now) + 2 * 3600000).toISOString() },
      { id: 'weekly', poolId: 'main', label: 'weekly', usedPercent: 68, resetsAt: new Date(Date.parse(now) + 3 * 86400000).toISOString() },
    ],
  }] : [] };
  responses = { ...timelines, status, source: { sources }, agents: { agents: inventory }, 'agents/activity': activity, tasks: { records }, permissions: permissionData, subscriptions: subscriptionData, preferences, 'relay/list': { relays: fixture.remoteLink && !fixture.remoteLink.empty && !fixture.remoteLink.local ? [{ id: 'relay-host', ingressId: 'relay-main', name: 'My relay', url: 'https://relay.example.com', owner: !fixture.remoteLink.joined, workerVersion: 'fixture' }] : [], version: 'fixture' }, 'relay/progress': fixture.relayProgress ?? { phase: 'idle' }, 'codex/login': { state: 'authenticated' }, 'local-access/status': { codeAvailable: true, desktopAvailable: true } };
  connector.set({ status, sources, sourcesLoaded: true, busy: '', loading: false, error: '', feedback: { text: '', error: false } });
  agents.set({ items: inventory, loaded: true, loading: false, saving: '', error: '' });
  acceptActivity(activity);
  tasks.set({ records, loading: false, error: '' });
  permissions.set({ data: permissionData, loading: false, error: '' });
  subscriptions.set({ snapshot: subscriptionData, error: '' });
  return async () => {
    if (fixture.tasks.some(task => task.completed)) {
      await settledViewModel();
      const finished = { ...activity, agents: Object.fromEntries(Object.entries(activity.agents).map(([agent, data]) => [agent, {
        sessions: data.sessions.filter(session => !fixture.tasks[Number(session.id.replace('fixture-task-', ''))]?.completed),
      }])) };
      responses['agents/activity'] = finished;
      acceptActivity(finished);
    }
    openSnapshotPanel(fixture.panel);
    if (fixture.detailTask !== undefined) {
      await settledViewModel();
      const task = fixture.tasks[fixture.detailTask];
      const session = activity.agents[task.agent].sessions.find(session => session.id === `fixture-task-${fixture.detailTask}`)!;
      selectAgentPanel({ type: 'task', agent: task.agent, session: { ...session, orderAt: Date.parse(session.startedAt!) } });
    }
    if (fixture.switchFlow) connectionSwitch.set(fixture.switchFlow);
    if (fixture.sourceSetup) onboarding.set(fixture.sourceSetup);
    if (fixture.connectionSetup) connectionSetup.set(fixture.connectionSetup);
    if (fixture.page) navigation.set({ page: fixture.page, remoteConnectionId: fixture.remoteConnectionId, remoteSourceId: fixture.remoteSourceId });
    await settledViewModel();
    document.documentElement.dataset.scenarioReady = name;
  };
}
