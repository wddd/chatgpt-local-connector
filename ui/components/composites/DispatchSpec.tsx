import type { AgentActivitySession, AgentConversation, AgentTimeline, DispatchSummary } from '../../types';
import type { TaskRecord } from '../../state/tasks';
import { useDispatchCatalog, type CatalogState, type DispatchCatalog } from '../../state/dispatchCatalog';
import { t } from '../../i18n';
import './DispatchSpec.css';

export type DispatchSpecRecord =
  | { kind: 'session'; value: Pick<AgentActivitySession | AgentConversation, 'id' | 'source' | 'dispatchSummary'> }
  | { kind: 'timeline'; value: Pick<AgentTimeline, 'dispatchSummary' | 'turnDispatchSummaries'>; taskId: string; turnId?: string; source?: AgentActivitySession['source'] }
  | { kind: 'task'; value: Pick<TaskRecord, 'agent' | 'taskId' | 'threadId' | 'requestId' | 'task'> };

/** Explicit turns never inherit task-level or current-default configuration. */
export function recordedDispatchSpec(record: DispatchSpecRecord): DispatchSummary | undefined {
  if (record.kind === 'timeline') return record.turnId ? record.value.turnDispatchSummaries?.[record.turnId] : record.value.dispatchSummary;
  if (record.kind === 'task') return { model: record.value.task.model, effort: record.value.task.effort };
  return record.value.dispatchSummary ?? undefined;
}
function modelKey(value: string) {
  // ACP model values can themselves be JSON-encoded identities. Compare the
  // complete identity; do not split it or infer labels from opaque segments.
  try { return JSON.stringify(JSON.parse(value)); } catch { return value; }
}
function resolveModel(catalog: DispatchCatalog | undefined, model: string) {
  return Array.isArray(catalog?.models) ? catalog.models.find(item => modelKey(item.model) === modelKey(model)) : undefined;
}
const effortKeys: Record<string, string> = Object.fromEntries(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(key => [key, `dispatchSpec.effort.${key}`]));
export function DispatchSpec({ agent, record, resolver }: { agent: string; record: DispatchSpecRecord; resolver?: CatalogState }) {
  const summary = recordedDispatchSpec(record);
  const owner = record.kind === 'task' ? record.value.agent ?? agent : agent;
  const taskId = owner === 'codex' ? undefined : record.kind === 'timeline' ? (record.source === 'transcript' ? undefined : record.taskId)
    : record.kind === 'task' ? record.value.taskId : record.value.source === 'arc-task' ? record.value.id : undefined;
  const native = useDispatchCatalog(owner, taskId, !resolver && !!summary?.model);
  const state = resolver ?? native, model = summary?.model?.trim(), effort = summary?.effort?.trim(), tier = summary?.serviceTier?.trim();
  const resolved = model ? resolveModel(state?.catalog, model) : undefined;
  const modelName = resolved?.name?.trim();
  const unresolvedModel = !!model && !modelName;
  const options = resolved?.options ?? (model && [state?.catalog?.currentModel, state?.catalog?.optionsForModel].includes(model) ? state?.catalog?.options : undefined);
  const effortOption = options?.filter(option => option.category === 'thought_level' || ['reasoning_effort', 'reasoningEffort', 'thinkingLevel', 'effort', 'thought_level'].includes(option.id))
    .flatMap(option => option.values ?? []).find(option => typeof option !== 'string' && option.value === effort);
  const effortName = typeof effortOption === 'object' && effortOption.name || (effort && (effortKeys[effort] ? t(effortKeys[effort]) : `${t('dispatchSpec.unresolved')}: ${effort}`));
  const parts = [model && (modelName ? [modelName, resolved?.group].filter(Boolean).join(' · ') : `${t('dispatchSpec.unresolved')}: ${model}`), effortName,
    tier && (tier === 'priority' ? t('activity.fast') : tier === 'default' ? t('dispatchSpec.standard') : `${t('dispatchSpec.unresolved')}: ${tier}`) ].filter(Boolean);
  const unresolved = unresolvedModel || !!effort && !effortKeys[effort] && !(typeof effortOption === 'object' && effortOption.name) || !!tier && !['priority', 'default'].includes(tier);
  const status = !parts.length ? 'missing' : state?.status === 'loading' ? 'loading' : state?.status === 'error' ? 'error' : unresolved ? 'unresolved' : 'ready';
  if (model && status === 'loading') parts.push(t('dispatchSpec.loading'));
  if (model && status === 'error') parts.push(t('dispatchSpec.error'));
  const label = parts.join(' · ') || t('dispatchSpec.missing');
  const evidence = [model, effort, tier].filter(Boolean).join(' · ');
  return <span className="dispatch-spec" data-state={status} aria-busy={status === 'loading' || undefined} aria-label={`${label}${evidence ? ` (${evidence})` : ''}`} title={`${label}${evidence ? `\n${evidence}` : ''}`}>{label}</span>;
}
