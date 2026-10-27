import type { AgentActivitySession, AgentConversation, AgentTimeline, DispatchSummary } from '../../types';
import type { TaskRecord } from '../../state/tasks';
import { useDispatchCatalog, type CatalogState } from '../../state/dispatchCatalog';
import { t } from '../../i18n';
import { Tooltip } from '../ui';
import { modelLabel as catalogModelLabel } from './dispatchSpecLabel';

export type DispatchSpecRecord =
  | { kind: 'session'; value: Pick<AgentActivitySession | AgentConversation, 'id' | 'source' | 'dispatchSummary'> }
  | { kind: 'timeline'; value: Pick<AgentTimeline, 'dispatchSummary' | 'turnDispatchSummaries'>; taskId: string; turnId?: string; source?: AgentActivitySession['source'] }
  | { kind: 'task'; value: Pick<TaskRecord, 'agent' | 'taskId' | 'threadId' | 'requestId' | 'task'> };

/** Explicit turns never inherit task-level or current-default configuration. */
export function recordedDispatchSpec(record: DispatchSpecRecord): DispatchSummary | undefined {
  if (record.kind === 'timeline') return record.turnId ? record.value.turnDispatchSummaries?.[record.turnId] : record.value.dispatchSummary;
  if (record.kind === 'task') return { model: record.value.task.model, effort: record.value.task.effort, serviceTier: record.value.task.dispatch?.serviceTier ?? undefined };
  return record.value.dispatchSummary ?? undefined;
}
const effortKeys: Record<string, string> = Object.fromEntries(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(key => [key, `dispatchSpec.effort.${key}`]));
export function DispatchSpec({ agent, record, resolver, variant = 'panel' }: { agent: string; record: DispatchSpecRecord; resolver?: CatalogState; variant?: 'panel' | 'inline' }) {
  const summary = recordedDispatchSpec(record);
  const owner = record.kind === 'task' ? record.value.agent ?? agent : agent;
  const taskId = owner === 'codex' ? undefined : record.kind === 'timeline' ? (record.source === 'transcript' ? undefined : record.taskId)
    : record.kind === 'task' ? record.value.taskId : record.value.source === 'arc-task' ? record.value.id : undefined;
  const native = useDispatchCatalog(owner, taskId, !resolver && !!summary?.model);
  const state = resolver ?? native, model = summary?.model, effort = summary?.effort?.trim();
  const models = Array.isArray(state?.catalog?.models) ? state.catalog.models : [];
  const resolved = models.find(row => row.model === model);
  const options = resolved?.options ?? (model && [state?.catalog?.currentModel, state?.catalog?.optionsForModel].includes(model) ? state?.catalog?.options : undefined);
  const effortOption = options?.filter(option => option.category === 'thought_level' || ['reasoning_effort', 'reasoningEffort', 'thinkingLevel', 'effort', 'thought_level'].includes(option.id))
    .flatMap(option => option.values ?? []).find(option => typeof option !== 'string' && option.value === effort);
  const effortName = typeof effortOption === 'object' && effortOption.name || (effort && effortKeys[effort] ? t(effortKeys[effort]) : undefined);
  const modelLabel = model ? catalogModelLabel(model, models) : undefined;
  const label = [modelLabel, effortName].filter(Boolean).join(' · ');
  if (!label) return null;
  return <Tooltip text={label}><span className="dispatch-spec inline-block min-w-0 max-w-full rounded-full bg-secondary px-2 py-1 text-xs leading-snug whitespace-normal align-middle text-muted-foreground data-[variant=inline]:border data-[variant=inline]:bg-transparent data-[variant=inline]:px-1.5 data-[variant=inline]:py-0 data-[variant=inline]:text-xs data-[variant=inline]:leading-4" data-variant={variant} tabIndex={0} aria-label={label}>
    {label}
  </span></Tooltip>;
}
