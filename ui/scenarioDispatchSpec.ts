import type { CatalogState, DispatchCatalog } from './state/dispatchCatalog';
import type { DispatchSpecRecord } from './components/composites/DispatchSpec';

export const dispatchCatalogFixtures: Record<string, DispatchCatalog> = {
  codex: { source: 'codex-model-list', models: [{ model: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' }] },
  dsh: { source: 'persisted-session-snapshot', currentModel: '["magpie","opencode-go/deepseek-v4.1-flash"]', models: [
    { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', name: 'DeepSeek V4.1 Flash · OpenCode Go' },
  ], options: [{ id: 'reasoning_effort', values: [{ value: 'max', name: 'Max' }] }] },
};
const session = (id: string, dispatchSummary: { model?: string; effort?: string; serviceTier?: string }): DispatchSpecRecord => ({ kind: 'session', value: { id, source: 'arc-task', dispatchSummary } });
export const dispatchSpecFixtures: { label: string; agent: string; record: DispatchSpecRecord; resolver: CatalogState; variant?: 'panel' | 'inline' }[] = [
  { label: 'Native catalog', agent: 'codex', record: session('codex-task', { model: 'gpt-6.1-sol', effort: 'high', serviceTier: 'priority' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'ACP model labels', agent: 'dsh', record: session('dsh-task', { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', effort: 'max' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.dsh } },
  { label: 'Unknown model', agent: 'unknown', record: session('opaque-task', { model: 'opaque/model-id', effort: 'high' }), resolver: { status: 'ready', catalog: { unavailable: 'needs-session' } } },
  { label: 'Loading labels', agent: 'dsh', record: session('loading-task', { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', effort: 'max', serviceTier: 'priority' }), resolver: { status: 'loading' } },
  { label: 'Catalog failure', agent: 'dsh', record: session('error-task', { model: 'opaque/model-id' }), resolver: { status: 'error' } },
  { label: 'Older recorded turn', agent: 'codex', record: { kind: 'timeline', taskId: 'multi-turn', turnId: 'older', value: { dispatchSummary: { model: 'current-must-not-leak', effort: 'high', serviceTier: 'priority' }, turnDispatchSummaries: { older: { model: 'gpt-6.1-sol', effort: 'low' } } } }, resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'Missing older turn', agent: 'codex', record: { kind: 'timeline', taskId: 'multi-turn', turnId: 'missing', value: { dispatchSummary: { model: 'current-must-not-leak', serviceTier: 'priority' } } }, resolver: { status: 'ready' } },
  { label: 'Task without a tier contract', agent: 'codex', record: { kind: 'task', value: { requestId: 'task-request', task: { kind: 'create', prompt: '', input: null, model: 'gpt-6.1-sol', effort: 'medium', settings: { serviceTier: 'priority' } } } }, resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'Task with recorded tier', agent: 'codex', record: { kind: 'task', value: { requestId: 'task-tier-request', task: { kind: 'create', prompt: '', input: null, model: 'gpt-6.1-sol', effort: 'high', dispatch: { serviceTier: 'priority' }, settings: {} } } }, resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  ...(['panel', 'inline'] as const).map(variant => ({ label: `Claude Code without model (${variant})`, agent: 'claude', record: session(`claude-${variant}`, { effort: 'high', serviceTier: 'default' }), resolver: { status: 'ready' as const }, variant })),
];
