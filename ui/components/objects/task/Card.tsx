import type { ReactNode, Ref } from 'react';
import { ArrowUpRight, ArrowLeft, MoreHorizontal, X } from 'lucide-react';
import { t } from '../../../i18n';
import type { AgentActivitySession, AgentTimeline, DispatchSummary } from '../../../types';
import type { TaskRecord, TaskRuntime } from '../../../state/tasks';
import { taskState } from '../../../state/taskProjection';
import { timelineGroups } from '../../../state/timelineGroups';
import { EntityCard, SectionHeader, StateBadge, Button, Icon, IconButton, Menu } from '../../ui';
import { ContextSettings } from '../../composites/ContextSettings';
import { DispatchSpec } from '../../composites/DispatchSpec';
import TaskOwnership from '../../TaskOwnership';
import { SrcAccountChip } from '../src-account';
import { statePresentation } from '../statePresentation';
import { projectName, receiptState, taskIdentity } from './projection';
import { Progress } from '../../ui/progress';

type Detail =
  | { kind: 'timeline'; session: AgentActivitySession; fallbackSession?: AgentActivitySession; timeline?: AgentTimeline; title?: string; running: boolean; hasPending: boolean; turnId?: string; source?: DispatchSummary['controlSource']; duration?: string }
  | { kind: 'receipt'; record: TaskRecord; runtime?: TaskRuntime; records: readonly TaskRecord[] };

/** The owner supplies actions and the detail body; this adapter owns the summary. */
export function TaskCard({ task, agent, agentName = agent, titleId, children, onBack, onClose, onOpen, expanded, onToggleWidth, narrow, busy, className = '', rootRef }: {
  task: Detail; agent: string; agentName?: string; titleId?: string; children?: ReactNode;
  onBack?: () => void; onClose?: () => void; onOpen?: () => void; expanded?: boolean; onToggleWidth?: () => void;
  narrow?: boolean; busy?: boolean; className?: string; rootRef?: Ref<HTMLElement>;
}) {
  const timeline = task.kind === 'timeline' ? task.timeline : undefined;
  const identity = task.kind === 'receipt' ? taskIdentity(task) : undefined;
  const title = task.kind === 'timeline' ? task.title || t('timeline.title') : identity!.title;
  const project = task.kind === 'timeline' ? timeline?.projectName || task.session.projectName || task.fallbackSession?.projectName || projectName(task.fallbackSession?.project || task.session.project) : projectName(identity!.project);
  const state = task.kind === 'timeline' ? taskState(timeline?.status, task.running, task.hasPending) : receiptState(task.record, task.runtime, task.records);
  const presentation = task.kind === 'timeline' ? statePresentation('task', state) : statePresentation('dispatch',
    ({ runtimeError: 'failed', awaitingConfirmation: 'pending', awaitingInteraction: 'pending', idle: 'completed' } as Record<string, string>)[state] || state);
  const groups = task.kind === 'timeline' ? timelineGroups(timeline?.entries ?? []) : [];
  const header = <SectionHeader className="task-detail-header flex shrink-0 flex-col items-stretch gap-2 bg-card px-3 py-3 [&>.section-header-copy]:w-full [&>.section-header-copy]:flex-none" level={2}
    back={(onBack || onOpen || onToggleWidth || onClose) && <div className="task-detail-navigation flex min-w-0 justify-between gap-2 [&>.button]:min-w-0 [&>.button]:justify-start [&>.button]:text-muted-foreground [&>.button>span]:truncate">
      {onBack ? <Button variant="ghost" className="min-w-0 flex-1 shrink" aria-label={t('back')} title={`${agentName}${project ? ` · ${project}` : ''}`} onClick={onBack}>
        <Icon icon={ArrowLeft} /><span>{agentName}{project && ` · ${project}`}</span></Button> : <span className="task-card-project min-w-0 truncate text-muted-foreground">{project}</span>}
      {onToggleWidth && <ContextSettings label={t('context.panelWidth')} value={expanded ? 'wide' : 'normal'} options={[{ value: 'normal', label: t('context.normal') }, { value: 'wide', label: t('context.wide') }]} onChange={value => { if ((value === 'wide') !== !!expanded) onToggleWidth(); }} />}
      {!narrow && <div className="flex shrink-0 items-center gap-1">
        {onOpen && <IconButton icon={ArrowUpRight} label={t('activity.open')} busy={busy} onClick={onOpen} />}
        {onClose && <IconButton icon={X} label={t('close')} disabled={busy} onClick={onClose} />}
      </div>}
      {narrow && (onOpen || onToggleWidth || onClose) && <div className="task-narrow-menu shrink-0"><Menu label={t('detail.taskActions')} trigger={<IconButton icon={MoreHorizontal} label={t('detail.taskActions')} disabled={busy} />} items={[
        ...(onOpen ? [{ label: t('activity.open'), action: onOpen }] : []),
        ...(onClose ? [{ label: t('close'), action: onClose }] : []),
      ]} /></div>}
    </div>}
    title={title} titleProps={{ id: titleId, className: 'block min-w-0 truncate text-base font-semibold' }}>
    <div className="task-detail-chips flex min-w-0 flex-wrap items-center gap-1.5"><StateBadge presentation={presentation} label={task.kind === 'receipt' ? t(state) : undefined} />
      <DispatchSpec agent={agent} record={task.kind === 'receipt' ? { kind: 'task', value: task.record }
        : timeline ? { kind: 'timeline', value: timeline, taskId: task.session.id, turnId: task.turnId, source: task.session.source, session: task.session }
        : { kind: 'session', value: task.session }} />
      {task.kind === 'timeline' && task.source && <SrcAccountChip provenance={task.source} />}
      <TaskOwnership ownership={task.kind === 'receipt' ? task.runtime?.ownership : timeline?.ownership} />
      {task.kind === 'timeline' && task.duration !== undefined && <time className="timeline-meta flex items-center gap-1.5 text-xs text-muted-foreground wrap-anywhere task-duration ml-auto shrink-0 whitespace-nowrap">{task.duration}</time>}
    </div>
    {task.kind === 'timeline' && !!groups.length && <div className="task-turn-progress flex gap-1">{groups.map((group, index) => {
      const current = index === groups.length - 1 && (!task.session.turnId || task.session.turnId === group.turnId);
      const turnState = taskState((group.turnId && timeline?.turnStatuses?.[group.turnId]) || (current ? timeline?.status : undefined), current && task.running, current && task.hasPending);
      const plan = [...group.entries].reverse().find(entry => entry.type === 'plan')?.plan;
      const completed = plan?.filter(step => step.status === 'completed').length ?? 0;
      const value = plan?.length ? completed / plan.length * 100 : turnState === 'done' ? 100 : undefined;
      return <Progress key={group.id} value={value ?? null} className={`h-1 min-w-0 flex-1 bg-muted [&>[data-slot=progress-indicator]]:bg-current ${turnState === 'done' ? 'text-success' : turnState === 'running' ? 'text-brand-accent' : turnState === 'failed' ? 'text-destructive' : 'text-muted-foreground'} ${value === undefined ? '[&>[data-slot=progress-indicator]]:transform-none! [&>[data-slot=progress-indicator]]:opacity-40' : ''} ${value === undefined && turnState === 'running' ? 'motion-safe:animate-pulse [[data-reduced-motion=true]_&]:animate-none' : ''}`}
        aria-label={t('detail.turnProgress', { count: index + 1, state: t(`detail.state.${turnState}`) })}
        aria-valuetext={plan?.length ? t('detail.planProgress', { completed, count: plan.length }) : t(`detail.state.${turnState}`)}
        getValueLabel={() => plan?.length ? t('detail.planProgress', { completed, count: plan.length }) : t(`detail.state.${turnState}`)} />;
    })}</div>}
  </SectionHeader>;
  return <EntityCard asChild className={`task-object-card flex min-w-0 flex-col gap-0 rounded-none border-0 bg-transparent p-0 ${className}`}><section ref={rootRef} data-narrow={narrow || undefined}>
    {header}{children}
  </section></EntityCard>;
}
