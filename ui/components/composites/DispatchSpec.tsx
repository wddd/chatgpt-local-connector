import { useLayoutEffect, useRef, useState } from 'react';
import type { AgentActivitySession, AgentConversation, AgentTimeline, DispatchSummary } from '../../types';
import type { TaskRecord } from '../../state/tasks';
import { useDispatchCatalog, type CatalogState, type DispatchCatalog } from '../../state/dispatchCatalog';
import { t } from '../../i18n';
import { Tooltip } from '../ui';
import { shortenModelLabel } from './dispatchSpecLabel';

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
function modelKey(value: string) {
  // ACP model values can themselves be JSON-encoded identities. Compare the
  // complete identity; do not split it or infer labels from opaque segments.
  try { return JSON.stringify(JSON.parse(value)); } catch { return value; }
}
function resolveModel(catalog: DispatchCatalog | undefined, model: string) {
  return Array.isArray(catalog?.models) ? catalog.models.find(item => modelKey(item.model) === modelKey(model)) : undefined;
}
const effortKeys: Record<string, string> = Object.fromEntries(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(key => [key, `dispatchSpec.effort.${key}`]));
export function DispatchSpec({ agent, record, resolver, variant = 'panel' }: { agent: string; record: DispatchSpecRecord; resolver?: CatalogState; variant?: 'panel' | 'inline' }) {
  const summary = recordedDispatchSpec(record);
  const owner = record.kind === 'task' ? record.value.agent ?? agent : agent;
  const taskId = owner === 'codex' ? undefined : record.kind === 'timeline' ? (record.source === 'transcript' ? undefined : record.taskId)
    : record.kind === 'task' ? record.value.taskId : record.value.source === 'arc-task' ? record.value.id : undefined;
  const native = useDispatchCatalog(owner, taskId, !resolver && !!summary?.model);
  const state = resolver ?? native, model = summary?.model?.trim(), effort = summary?.effort?.trim(), tier = summary?.serviceTier?.trim();
  const resolved = model ? resolveModel(state?.catalog, model) : undefined;
  const nativeModelName = resolved?.name?.trim();
  const modelName = nativeModelName ? shortenModelLabel(nativeModelName) : undefined;
  const loadingModel = !!model && (!state || state.status === 'loading');
  const unresolvedModel = !!model && !modelName && !loadingModel;
  const options = resolved?.options ?? (model && [state?.catalog?.currentModel, state?.catalog?.optionsForModel].includes(model) ? state?.catalog?.options : undefined);
  const effortOption = options?.filter(option => option.category === 'thought_level' || ['reasoning_effort', 'reasoningEffort', 'thinkingLevel', 'effort', 'thought_level'].includes(option.id))
    .flatMap(option => option.values ?? []).find(option => typeof option !== 'string' && option.value === effort);
  const effortName = typeof effortOption === 'object' && effortOption.name || (effort && (effortKeys[effort] ? t(effortKeys[effort]) : `${t('dispatchSpec.unresolved')}: ${effort}`));
  const modelLabel = model && (modelName ? [modelName, resolved?.group].filter(Boolean).join(' · ') : loadingModel ? t('dispatchSpec.loading') : `${t('dispatchSpec.unresolved')}: ${model}`);
  const details = [effortName, tier === 'priority' ? t('activity.fast') : undefined].filter(Boolean);
  const unresolved = unresolvedModel || !!effort && !effortKeys[effort] && !(typeof effortOption === 'object' && effortOption.name);
  const status = !modelLabel && !details.length ? 'missing' : loadingModel ? 'loading' : model && state?.status === 'error' ? 'error' : unresolved ? 'unresolved' : 'ready';
  if (modelName && status === 'loading') details.push(t('dispatchSpec.loading'));
  if (model && status === 'error') details.push(t('dispatchSpec.error'));
  const label = [modelLabel, ...details].filter(Boolean).join(' · ') || t('dispatchSpec.missing');
  const leading = modelLabel || (!details.length ? label : undefined);
  // Shorten only readable catalog text, never opaque model identities.
  const shortModel = modelName?.split(' · ')[0].trim() || leading;
  const measure = useRef<HTMLSpanElement>(null);
  const [shortened, setShortened] = useState(false);
  useLayoutEffect(() => {
    const node = measure.current;
    if (!node) return;
    const check = () => setShortened(node.scrollWidth > node.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    document.fonts?.addEventListener('loadingdone', check);
    return () => { observer.disconnect(); document.fonts?.removeEventListener('loadingdone', check); };
  }, [leading]);
  if (variant === 'inline' && status === 'missing') return null;
  return <Tooltip text={label}><span className="dispatch-spec inline-grid grid-cols-[repeat(2,minmax(0,auto))] min-w-0 max-w-full overflow-hidden rounded-full bg-secondary px-2 py-1 text-xs leading-snug whitespace-nowrap align-middle text-muted-foreground data-[variant=inline]:flex-initial data-[variant=inline]:items-center data-[variant=inline]:border data-[variant=inline]:bg-transparent data-[variant=inline]:px-1.25 data-[variant=inline]:py-0 data-[variant=inline]:text-2xs data-[variant=inline]:leading-4 data-[state=unresolved]:text-warning data-[state=error]:text-warning" data-variant={variant} data-state={status} tabIndex={0} aria-busy={status === 'loading' || undefined} aria-label={label}>
    {leading && <span className="dispatch-spec-model grid min-w-0" aria-hidden="true">
      <span ref={measure} className="dispatch-spec-measure col-start-1 row-start-1 min-w-0 overflow-hidden invisible">{leading}</span>
      <span className="dispatch-spec-name col-start-1 row-start-1 min-w-0 overflow-hidden text-ellipsis">{shortened ? shortModel : leading}</span>
    </span>}
    {!!details.length && <span className="dispatch-spec-details min-w-0 overflow-hidden text-ellipsis whitespace-pre" aria-hidden="true">{leading ? ' · ' : ''}{details.join(' · ')}</span>}
  </span></Tooltip>;
}
