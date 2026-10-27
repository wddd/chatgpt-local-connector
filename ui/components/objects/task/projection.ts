import type { AgentActivitySession, AgentConversation } from '../../../types';
import type { TrackedActivity } from '../../../state/activityModel';
import type { TaskRecord, TaskRuntime } from '../../../state/tasks';
import { taskState } from '../../../state/taskProjection';
import { dispatchState } from '../../../state/sourceDispatch';
import { t } from '../../../i18n';

export type TaskReference =
  | { kind: 'activity'; session: TrackedActivity; live: boolean }
  | { kind: 'conversation'; conversation: AgentConversation }
  | { kind: 'receipt'; record: TaskRecord; runtime?: TaskRuntime; records?: readonly TaskRecord[]; live?: AgentActivitySession };

export const taskId = (record: TaskRecord) => record.taskId || record.threadId || record.task.threadId;
export const projectName = (path?: string | null) => path?.trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

export function conversationActivity(conversation: AgentConversation): TrackedActivity {
  return {
    id: conversation.id, source: conversation.source === 'native' ? 'transcript' : conversation.source, status: conversation.status, title: conversation.title || undefined,
    phase: 'idle', phaseSince: null, headline: '', startedAt: conversation.createdAt,
    project: conversation.project, projectName: conversation.projectName,
    dispatchSummary: conversation.dispatchSummary ?? undefined, turnCount: conversation.turnCount ?? undefined,
    agentAccountId: conversation.agentAccountId ?? conversation.dispatchSummary?.agentAccountId,
    nativeSessionId: conversation.nativeSessionId ?? undefined, open: conversation.open,
    timeline: true, orderAt: Date.parse(conversation.createdAt ?? '') || 0, conversation: true,
  };
}

export function receiptState(record: TaskRecord, runtime?: TaskRuntime, records: readonly TaskRecord[] = [record]) {
  if (records.some(value => value.error)) return 'runtimeError';
  if (records.some(value => value.state === 'awaiting-approval')) return 'awaitingConfirmation';
  if (runtime?.archived) return 'archived';
  if (!runtime || runtime.stale) return 'unknown';
  return ({ waiting: 'awaitingInteraction', active: 'running', idle: 'idle', systemError: 'runtimeError' } as Record<string, string>)[runtime.runtimeStatus] || 'unknown';
}

export function taskIdentity(reference: TaskReference) {
  if (reference.kind === 'receipt') {
    const { record, runtime, live } = reference;
    return { title: record.task.title || live?.title || runtime?.title || record.task.prompt.split('\n')[0]?.slice(0, 90) || t('taskRequest'),
      project: record.task.project || record.task.directory || runtime?.project || '',
      state: dispatchState(record, runtime, live) };
  }
  const session = reference.kind === 'conversation' ? reference.conversation : reference.session;
  const live = reference.kind === 'activity' && reference.live;
  return { title: session.title || (reference.kind === 'activity' ? reference.session.headline : '') || t('timeline.title'),
    project: session.projectName || projectName(session.project),
    state: taskState(session.status ?? (reference.kind === 'activity' && reference.session.endedAt !== undefined ? 'completed' : undefined), live, reference.kind === 'activity' && !!reference.session.interaction) };
}

export function dispatchActivity(record: TaskRecord, runtime?: TaskRuntime, live?: AgentActivitySession): TrackedActivity | undefined {
  const id = record.threadId || record.task.threadId;
  const state = dispatchState(record, runtime, live);
  if (!id || !['running', 'pending'].includes(state) || !(live || runtime && !runtime.stale)) return;
  const title = taskIdentity({ kind: 'receipt', record, runtime, live }).title;
  return live ? { ...live, orderAt: Date.parse(record.createdAt) } : {
    id, source: 'codex-thread', title, phase: state === 'pending' ? 'interaction' : 'thinking', headline: title,
    phaseSince: null, timeline: true, project: record.task.project || record.task.directory,
    startedAt: record.createdAt, orderAt: Date.parse(record.createdAt),
  };
}
