// Development-only task operations. Every mutation stays in the scenario's memory.
import type { AgentActivitySnapshot, AgentTimeline, AgentTimelineEntry } from './types';
import type { TaskRecord } from './state/tasks';
import type { TaskReview } from './state/taskControl';
import type { QueuedMessage } from './state/taskQueue';

export function taskScenario(timelines: Record<string, AgentTimeline>, activity: AgentActivitySnapshot, records: TaskRecord[], changed: () => void) {
  const queue: (QueuedMessage & { turnId?: string })[] = [], reviews = new Map<string, Map<string, TaskReview>>();
  const receipts = new Map<string, Record<string, unknown>>();
  const read = (id: string) => {
    const timeline = timelines[`agents/timeline/${id}`];
    if (!timeline) throw new Error('SCENARIO_TASK_NOT_FOUND');
    return timeline;
  };
  const append = (timeline: AgentTimeline, row: Pick<AgentTimelineEntry, 'type' | 'turnId'> & Partial<AgentTimelineEntry>) => {
    const at = new Date().toISOString(), cursor = ++timeline.cursor;
    timeline.entries.push({ id: crypto.randomUUID(), status: 'completed', startedAt: at, updatedAt: at, endedAt: at, cursor, position: timeline.entries.length, ...row });
  };
  const latest = (timeline: AgentTimeline) => timeline.entries.at(-1)?.turnId ?? '';
  const running = (timeline: AgentTimeline) => ['running', 'inProgress'].includes(timeline.status ?? '');
  const finish = (id: string, status: 'completed' | 'cancelled') => {
    const timeline = read(id), turn = latest(timeline);
    timeline.status = status; (timeline.turnStatuses ??= {})[turn] = status;
    for (const row of timeline.entries.filter(row => row.turnId === turn && ['running', 'pending'].includes(row.status))) {
      row.status = status; row.endedAt = row.updatedAt = new Date().toISOString(); row.cursor = ++timeline.cursor;
    }
    for (const group of Object.values(activity.agents)) group.sessions = group.sessions.filter(session => session.id !== id);
    for (const row of queue.filter(row => row.threadId === id && row.state === 'queued')) row.state = 'blocked';
  };
  const operate = (op: string, args: Record<string, any>): unknown => {
    const id = args.threadId ?? args.taskId ?? args.id;
    if (op === 'codex_queue') return { items: queue.filter(row => (!args.threadId || row.threadId === args.threadId) && (!args.queueId || row.queueId === args.queueId)).reverse(), total: queue.length };
    if (op === 'task_reviews') return { reviews: [...(reviews.get(id) ?? [])].map(([turnId, review]) => ({turnId, review})) };
    if (op === 'receipt') {
      const original = records.find(row => row.requestId === args.requestId);
      if (!args.action || args.action === 'read') return receipts.get(args.requestId) ?? original ?? {state:'not-found'};
      if (!original || original.state !== 'awaiting-approval') throw new Error('SCENARIO_RECEIPT_NOT_PENDING');
      original.state = args.action === 'reject' ? 'not-executed' : 'completed';
      original.approval = {decision:args.action === 'approve' ? 'approved' : args.action, source:'local', at:new Date().toISOString()};
      changed(); return original;
    }
    if (op === 'codex_queue_control') {
      const rows = queue.filter(row => row.threadId === id && (!args.queueId || row.queueId === args.queueId) && ['queued','blocked'].includes(row.state));
      for (const row of rows) {
        if (args.action === 'promote') {
          const timeline = read(id); if (!running(timeline)) throw new Error('NO_ACTIVE_TURN');
          append(timeline, {type:'user',turnId:latest(timeline),text:row.text}); row.state = 'steered'; row.turnId = latest(timeline);
        } else if (args.action === 'cancel') row.state = 'cancelled';
        else throw new Error('SCENARIO_ACTION_UNAVAILABLE');
      }
      changed(); return {changed:rows.length,items:rows};
    }
    if (op === 'task_review_undo') {
      const rows = reviews.get(id), review = rows?.get(args.turnId);
      if (!review || review.requestId !== args.reviewRequestId || review.verdict !== 'pass') throw new Error('SCENARIO_REVIEW_CHANGED');
      rows!.delete(args.turnId); return {undone:true};
    }
    const requestId = args.requestId ?? crypto.randomUUID();
    if (receipts.has(requestId)) return receipts.get(requestId);
    let result: Record<string, unknown> = {requestId,state:'completed',threadId:id};
    if (op === 'codex_send' || op === 'agent_send') {
      const timeline = read(id), active = running(timeline);
      if (args.sendMode === 'queue' || args.sendMode === 'next' && active) {
        queue.push({queueId:requestId,threadId:id,text:args.prompt,preview:args.prompt.slice(0,120),state:'queued'});
        result = {...result,queueId:requestId,dispatchMode:'queued'};
      } else if (active) {
        append(timeline, {type:'user',turnId:latest(timeline),text:args.prompt});
        result = {...result,turnId:latest(timeline),dispatchMode:'steered'};
      } else {
        if (args.sendMode === 'steer') throw new Error('NO_ACTIVE_TURN');
        const turnId = crypto.randomUUID(); append(timeline,{type:'user',turnId,text:args.prompt});
        append(timeline,{type:'text',turnId,phase:'final_answer',text:'Fixture response.'}); finish(id,'completed');
        result = {...result,turnId,dispatchMode:'new-turn'};
      }
    } else if (op === 'codex_interrupt' || op === 'agent_interrupt') {
      const timeline = read(id); if (latest(timeline) !== args.turnId) throw new Error('SCENARIO_TURN_CHANGED');
      finish(id,'cancelled'); result.turnId = args.turnId;
    } else if (op === 'codex_review' || op === 'agent_review') {
      if (running(read(id))) throw new Error('SCENARIO_TURN_RUNNING');
      let rows = reviews.get(id); if (!rows) reviews.set(id,rows = new Map());
      rows.set(args.turnId,{verdict:args.verdict,requestId,reviewedAt:new Date().toISOString(),reviewer:{controlSource:'ARC'}});
      result.turnId = args.turnId;
    } else if (op === 'codex_respond' || op === 'agent_respond') {
      const timeline = Object.values(timelines).find(t => t.entries.some(row => row.status === 'pending' && row.interaction?.respond.args?.id === args.id));
      const entry = timeline?.entries.find(row => row.status === 'pending' && row.interaction?.respond.args?.id === args.id);
      if (!timeline || !entry) throw new Error('STALE_INTERACTION');
      const at = new Date().toISOString(); entry.status = 'completed'; entry.updatedAt = at; entry.endedAt = at; entry.cursor = ++timeline.cursor;
      entry.response = {result:args.result,skipped:args.skipped === true || !!args.result?.answers && Object.values(args.result.answers as Record<string,{answers:string[]}>).every(answer=>!answer.answers.length),origin:{controlSource:'ARC',sourceLabel:'ARC'},resolvedAt:at};
      for (const group of Object.values(activity.agents)) for (const session of group.sessions) if (session.id === timeline.sessionId) { delete session.interaction; session.phase = 'text'; }
      result.threadId = timeline.sessionId;
    } else throw new Error(`SCENARIO_ACTION_UNAVAILABLE: ${op}`);
    receipts.set(requestId,result); changed(); return result;
  };
  return (route: string, body: unknown) => {
    const request = body as Record<string, any>;
    if (route === 'tasks/reviews') return operate('task_reviews',request);
    if (route === 'tasks/decision') return operate('receipt',request);
    if (route === 'tasks/control' || route === 'agents/respond') return operate(request.op,request.args);
    return undefined;
  };
}
