import type { AgentActivitySession, AgentConversation, AgentTimeline, DispatchSummary } from '../../types';
import type { TaskRecord } from '../../state/tasks';
import { useDispatchCatalog, type CatalogState } from '../../state/dispatchCatalog';
import { t } from '../../i18n';
import { Tooltip } from '../ui';
import { dispatchSpecLabel } from './dispatchSpecLabel';

export type DispatchSpecRecord =
  | { kind: 'session'; value: Pick<AgentActivitySession | AgentConversation, 'id' | 'source' | 'dispatchSummary'> }
  | { kind: 'timeline'; value: Pick<AgentTimeline, 'dispatchSummary' | 'turnDispatchSummaries'>; taskId: string; turnId?: string; source?: AgentActivitySession['source']; session?: Pick<AgentActivitySession, 'id' | 'turnId' | 'dispatchSummary'> }
  | { kind: 'task'; value: Pick<TaskRecord, 'agent' | 'taskId' | 'threadId' | 'requestId' | 'task'> };

/** Explicit turns never inherit task-level or current-default configuration. */
export function recordedDispatchSpec(record: DispatchSpecRecord): DispatchSummary | undefined {
  if (record.kind === 'timeline') {
    const recorded = record.turnId ? record.value.turnDispatchSummaries?.[record.turnId] : record.value.dispatchSummary;
    // A live projection is evidence for its own turn, never for an older turn.
    return recorded ?? (record.session?.id === record.taskId && record.turnId === record.session.turnId
      ? record.session.dispatchSummary ?? undefined : undefined);
  }
  if (record.kind === 'task') return { model: record.value.task.model, effort: record.value.task.effort, serviceTier: record.value.task.dispatch?.serviceTier ?? undefined };
  return record.value.dispatchSummary ?? undefined;
}
export function DispatchSpec({ agent, record, resolver, variant = 'panel' }: { agent: string; record: DispatchSpecRecord; resolver?: CatalogState; variant?: 'panel' | 'inline' }) {
  const summary = recordedDispatchSpec(record);
  const owner = record.kind === 'task' ? record.value.agent ?? agent : agent;
  const taskId = owner === 'codex' ? undefined : record.kind === 'timeline' ? (record.source === 'transcript' ? undefined : record.taskId)
    : record.kind === 'task' ? record.value.taskId : record.value.source === 'arc-task' ? record.value.id : undefined;
  const native = useDispatchCatalog(owner, taskId, !resolver && !!summary?.model);
  const catalog = (resolver ?? native)?.catalog;
  const models = Array.isArray(catalog?.models) ? catalog.models : [];
  const model = models.find(row => row.model === summary?.model);
  if (!model?.displayName && !model?.name) return null;
  const label = dispatchSpecLabel(summary, catalog, t);
  if (!label) return null;
  return <Tooltip text={label}><span className="dispatch-spec inline-block min-w-0 max-w-full rounded-full bg-secondary px-2 py-1 text-xs leading-snug whitespace-normal align-middle text-muted-foreground data-[variant=inline]:shrink-0 data-[variant=inline]:border data-[variant=inline]:bg-transparent data-[variant=inline]:px-1.5 data-[variant=inline]:py-0 data-[variant=inline]:text-xs data-[variant=inline]:leading-4" data-variant={variant} tabIndex={0} aria-label={label}>
    {label}
  </span></Tooltip>;
}
