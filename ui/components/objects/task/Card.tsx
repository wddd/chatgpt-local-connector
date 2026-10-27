import type { ReactNode, Ref } from 'react';
import { ArrowUpRight, ArrowLeft, Maximize2, Minimize2, MoreHorizontal, X } from 'lucide-react';
import { t } from '../../../i18n';
import type { AgentActivitySession, AgentTimeline, DispatchSummary } from '../../../types';
import type { TaskRecord, TaskRuntime } from '../../../state/tasks';
import { taskState } from '../../../state/taskProjection';
import { timelineGroups } from '../../../state/timelineGroups';
import { EntityCard, SectionHeader, StateBadge, Button, Icon, IconButton, Menu } from '../../ui';
import { DispatchSpec } from '../../composites/DispatchSpec';
import TaskOwnership from '../../TaskOwnership';
import { SrcAccountChip } from '../src-account';
import { statePresentation } from '../statePresentation';
import { projectName, receiptState, taskIdentity } from './projection';
import '../../TaskDetail.css';
import './task.css';

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
  const header = <SectionHeader className="dialog-header task-detail-header" level={2}
    back={(onBack || onOpen || onToggleWidth || onClose) && <div className="task-detail-navigation">
      {onBack ? <Button variant="ghost" aria-label={t('back')} title={`${agentName}${project ? ` · ${project}` : ''}`} onClick={onBack}>
        <Icon icon={ArrowLeft} /><span>{agentName}{project && ` · ${project}`}</span></Button> : <span className="task-card-project">{project}</span>}
      {!narrow && <div className="actions">
        {onOpen && <IconButton icon={ArrowUpRight} label={t('activity.open')} busy={busy} onClick={onOpen} />}
        {onToggleWidth && <IconButton icon={expanded ? Minimize2 : Maximize2} label={t(expanded ? 'restorePanelWidth' : 'expandPanelWidth')} aria-pressed={expanded} onClick={onToggleWidth} />}
        {onClose && <IconButton icon={X} label={t('close')} disabled={busy} onClick={onClose} />}
      </div>}
      {narrow && (onOpen || onToggleWidth || onClose) && <div className="task-narrow-menu"><Menu label={t('detail.taskActions')} trigger={<IconButton icon={MoreHorizontal} label={t('detail.taskActions')} disabled={busy} />} items={[
        ...(onOpen ? [{ label: t('activity.open'), action: onOpen }] : []),
        ...(onToggleWidth ? [{ label: t(expanded ? 'restorePanelWidth' : 'expandPanelWidth'), action: onToggleWidth }] : []),
        ...(onClose ? [{ label: t('close'), action: onClose }] : []),
      ]} /></div>}
    </div>}
    title={title} titleProps={{ id: titleId, className: 'activity-panel-title' }}>
    <div className="task-detail-chips"><StateBadge presentation={presentation} label={task.kind === 'receipt' ? t(state) : undefined} />
      <DispatchSpec agent={agent} record={task.kind === 'receipt' ? { kind: 'task', value: task.record }
        : timeline ? { kind: 'timeline', value: timeline, taskId: task.session.id, turnId: task.turnId, source: task.session.source }
        : { kind: 'session', value: task.session }} />
      {task.kind === 'timeline' && task.source && <SrcAccountChip provenance={task.source} />}
      <TaskOwnership ownership={task.kind === 'receipt' ? task.runtime?.ownership : timeline?.ownership} />
      {task.kind === 'timeline' && task.duration !== undefined && <time className="timeline-meta task-duration">{task.duration}</time>}
    </div>
    {task.kind === 'timeline' && !!groups.length && <div className="task-turn-progress">{groups.map((group, index) => {
      const current = index === groups.length - 1 && (!task.session.turnId || task.session.turnId === group.turnId);
      const turnState = taskState((group.turnId && timeline?.turnStatuses?.[group.turnId]) || (current ? timeline?.status : undefined), current && task.running, current && task.hasPending);
      const plan = [...group.entries].reverse().find(entry => entry.type === 'plan')?.plan;
      const completed = plan?.filter(step => step.status === 'completed').length ?? 0;
      const value = plan?.length ? completed / plan.length * 100 : turnState === 'done' ? 100 : undefined;
      return <div key={group.id} role="progressbar" aria-label={t('detail.turnProgress', { count: index + 1, state: t(`detail.state.${turnState}`) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
        aria-valuetext={plan?.length ? t('detail.planProgress', { completed, total: plan.length }) : t(`detail.state.${turnState}`)} data-state={turnState} data-indeterminate={value === undefined || undefined}>
        <span style={value === undefined ? undefined : { width: `${value}%` }} />
      </div>;
    })}</div>}
  </SectionHeader>;
  return <EntityCard asChild className={`task-object-card ${className}`}><section ref={rootRef} data-narrow={narrow || undefined}>
    {header}{children}
  </section></EntityCard>;
}
