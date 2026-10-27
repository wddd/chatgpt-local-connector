import { memo, type CSSProperties, type ReactNode } from 'react';
import { t } from '../../../i18n';
import type { TrackedActivity } from '../../../state/activityModel';
import type { TaskRecord, TaskRuntime } from '../../../state/tasks';
import type { AgentActivitySession } from '../../../types';
import { dispatchState } from '../../../state/sourceDispatch';
import { EntityRow, StateBadge } from '../../ui';
import { DispatchSpec } from '../../composites/DispatchSpec';
import { plainMarkdown } from '../../ui/Markdown';
import { PhaseTile } from '../../activity';
import { statePresentation } from '../statePresentation';
import { ActivityBubbleContent } from './Content';
import { dispatchActivity, projectName, receiptState, taskIdentity } from './projection';
import './task.css';

export function taskTime(value: string) {
  const date = new Date(value), pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
type Props = { selected?: boolean; disabled?: boolean; actions?: ReactNode } & (
  | { kind: 'activity'; agent: string; session: TrackedActivity; live: boolean; now: number; index?: number; onOpen?: () => void }
  | { kind: 'receipt'; record: TaskRecord; runtime?: TaskRuntime; records: readonly TaskRecord[]; id: string; onOpen: () => void }
  | { kind: 'dispatch'; record: TaskRecord; runtime?: TaskRuntime; live?: AgentActivitySession; onOpen: (session: TrackedActivity) => void }
);
export const TaskRow = memo(function TaskRow(props: Props) {
  const { selected, disabled, actions } = props;
  if (props.kind === 'activity') {
    const { agent, session, live, now, index = 0, onOpen } = props;
    return <EntityRow className={`activity-bubble agent-conversation-row ${session.interaction ? 'needs-attention' : ''}`} selected={selected} disabled={disabled} actions={actions}
      data-density="standard" data-external={session.source === 'transcript' || undefined} data-timeline-anchor
      style={{ '--row-delay': `${Math.min(index, 5) * 24}ms` } as CSSProperties} data-activity-session={JSON.stringify([agent, session.id])}
      aria-label={`${session.title || t('timeline.title')} · ${t('timeline.open')}`} onClick={onOpen}>
      <ActivityBubbleContent agent={agent} session={session} now={now} density="standard" historical={!live} conversationRow />
    </EntityRow>;
  }
  const { record, runtime } = props;
  const identity = taskIdentity({ kind: 'receipt', record, runtime, live: props.kind === 'dispatch' ? props.live : undefined });
  if (props.kind === 'dispatch') {
    const state = dispatchState(record, runtime, props.live);
    const session = dispatchActivity(record, runtime, props.live);
    const phase = state === 'pending' ? 'interaction' : state === 'running' ? props.live?.phase ?? 'thinking' : 'idle';
    return <EntityRow className="source-dispatch-row" selected={selected} actions={actions} disabled={disabled || !session} attention={state === 'pending'} data-state={state}
      onClick={() => { if (session) props.onOpen(session); }} chevron={!!session}>
      <PhaseTile phase={phase} completed={state === 'completed'} animated={false} />
      <span><strong>{identity.title}</strong><span className="source-dispatch-meta">{record.agent ?? 'Codex'} · <StateBadge variant="text" presentation={statePresentation('dispatch', state)} /></span>
        <DispatchSpec agent={record.agent || 'codex'} record={{ kind: 'task', value: record }} variant="inline" /></span>
    </EntityRow>;
  }
  const state = receiptState(record, runtime, props.records);
  return <EntityRow className="task-document" data-task-id={props.id} selected={selected} disabled={disabled} actions={actions}
    aria-label={identity.title} aria-haspopup="dialog" onClick={props.onOpen}>
    <span className="task-document-heading"><strong className="task-document-title">{identity.title}</strong>
      <DispatchSpec agent={record.agent || 'codex'} record={{ kind: 'task', value: record }} /></span>
    <span className="task-document-meta">
      {projectName(identity.project) && <span className="task-tag task-document-project" title={identity.project}>{projectName(identity.project)}</span>}
      {state === 'running' && <StateBadge variant="text" presentation={statePresentation('dispatch', 'running')} label={t('running')} />}
      <time dateTime={record.createdAt}>{taskTime(record.createdAt)}</time>
    </span>
    {record.task.prompt && <span className="task-document-preview">{plainMarkdown(record.task.prompt)}</span>}
  </EntityRow>;
});
