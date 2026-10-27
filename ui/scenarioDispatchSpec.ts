import type { CatalogState, DispatchCatalog } from './state/dispatchCatalog';
import type { DispatchSpecRecord } from './components/composites/DispatchSpec';

export const longDispatchModel = { model: 'fixture-independent-model', name: 'Independent Research Model With An Intentionally Long Native Display Name', displayName: 'Independent Research Model With An Intentionally Long Native Display Name' };
export const longDispatchEffort = 'experimental-reasoning-effort-with-an-unbroken-recorded-value';

export const dispatchCatalogFixtures: Record<string, DispatchCatalog> = {
  codex: { source: 'codex-model-list', authoritative: true, models: [{ model: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', displayName: 'GPT-6.1 Sol' }, { model: 'gpt-6-astra', name: 'GPT-6-Astra', displayName: 'GPT-6-Astra' }, longDispatchModel] },
  claude: { source: 'persisted-session-snapshot', authoritative: false, models: [{ model: 'claude-opus-5-5', name: 'Claude Opus 5.5', displayName: 'Claude Opus 5.5' }] },
  dsh: { source: 'persisted-session-snapshot', authoritative: false, currentModel: '["magpie","opencode-go/deepseek-v4.1-flash"]', models: [
    { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', name: 'DeepSeek V4.1 Flash · OpenCode Go', displayName: 'DeepSeek V4.1 Flash · OpenCode Go' },
  ], options: [{ id: 'reasoning_effort', values: [{ value: 'max', name: 'Max' }] }] },
};
const session = (id: string, dispatchSummary: { model?: string; effort?: string; serviceTier?: string }): DispatchSpecRecord => ({ kind: 'session', value: { id, source: 'arc-task', dispatchSummary } });
export const dispatchSpecFixtures: { label: string; agent: string; record: DispatchSpecRecord; resolver: CatalogState; variant?: 'panel' | 'inline' }[] = [
  { label: 'Long native label', agent: 'codex', record: session('long-native-label', { model: longDispatchModel.model, effort: 'high', serviceTier: 'priority' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'Long recorded effort', agent: 'codex', record: session('long-effort', { effort: longDispatchEffort }), resolver: { status: 'ready' }, variant: 'inline' },
  { label: 'Native catalog', agent: 'codex', record: session('codex-task', { model: 'gpt-6.1-sol', effort: 'high', serviceTier: 'priority' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'ACP model labels', agent: 'dsh', record: session('dsh-task', { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', effort: 'max' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.dsh } },
  { label: 'Claude recorded model', agent: 'claude', record: session('claude-recorded', { model: 'claude-opus-5-5', effort: 'medium' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.claude }, variant: 'inline' },
  { label: 'Native brand prefix preserved', agent: 'codex', record: session('astra-recorded', { model: 'gpt-6-astra', effort: 'high' }), resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex }, variant: 'inline' },
  { label: 'Unknown model', agent: 'unknown', record: session('opaque-task', { model: 'opaque/model-id', effort: 'high' }), resolver: { status: 'ready', catalog: { unavailable: 'needs-session' } } },
  { label: 'Loading labels', agent: 'dsh', record: session('loading-task', { model: '["magpie","opencode-go/deepseek-v4.1-flash"]', effort: 'max', serviceTier: 'priority' }), resolver: { status: 'loading' } },
  { label: 'Catalog failure', agent: 'dsh', record: session('error-task', { model: 'opaque/model-id' }), resolver: { status: 'error' } },
  { label: 'Older recorded turn', agent: 'codex', record: { kind: 'timeline', taskId: 'multi-turn', turnId: 'older', value: { dispatchSummary: { model: 'current-must-not-leak', effort: 'high', serviceTier: 'priority' }, turnDispatchSummaries: { older: { model: 'gpt-6.1-sol', effort: 'low' } } } }, resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'Missing older turn', agent: 'codex', record: { kind: 'timeline', taskId: 'multi-turn', turnId: 'missing', value: { dispatchSummary: { model: 'current-must-not-leak', serviceTier: 'priority' } } }, resolver: { status: 'ready' } },
  { label: 'Task without a tier contract', agent: 'codex', record: { kind: 'task', value: { requestId: 'task-request', task: { kind: 'create', prompt: '', input: null, model: 'gpt-6.1-sol', effort: 'medium', settings: { serviceTier: 'priority' } } } }, resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'Task with recorded tier', agent: 'codex', record: { kind: 'task', value: { requestId: 'task-tier-request', task: { kind: 'create', prompt: '', input: null, model: 'gpt-6.1-sol', effort: 'high', dispatch: { serviceTier: 'priority' }, settings: {} } } }, resolver: { status: 'ready', catalog: dispatchCatalogFixtures.codex } },
  { label: 'Native provider disambiguation', agent: 'dsh', record: session('same-name', { model: 'opaque-one' }), resolver: { status: 'ready', catalog: { authoritative: true, models: [
    { model: 'opaque-one', displayName: 'Shared native name', provider: { id: 'one', name: 'First provider' } },
    { model: 'opaque-two', displayName: 'Shared native name', provider: { id: 'two', name: 'Second provider' } },
  ] } } },
  { label: 'Catalog entry without display metadata', agent: 'dsh', record: session('no-native-name', { model: '["opaque", "identity"]' }), resolver: { status: 'ready', catalog: { authoritative: true, models: [{ model: '["opaque", "identity"]' }] } } },
  { label: 'Selection absent from complete catalog', agent: 'dsh', record: session('stale-selection', { model: 'retired-model' }), resolver: { status: 'ready', catalog: { authoritative: true, models: [] } } },
  { label: 'Selection absent from partial catalog', agent: 'dsh', record: session('partial-catalog', { model: 'unlisted-model' }), resolver: { status: 'ready', catalog: { authoritative: false, models: [] } } },
  ...(['panel', 'inline'] as const).map(variant => ({ label: `Claude Code without model (${variant})`, agent: 'claude', record: session(`claude-${variant}`, { effort: 'high', serviceTier: 'default' }), resolver: { status: 'ready' as const }, variant })),
];
