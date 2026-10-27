import { useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { srcConversationsApi, type SrcConversation } from '../srcConversations';
import { agentActivity } from '../state/activity';
import { selectAgentPanel } from '../state/overviewPanels';
import { api } from '../api';
import type { AgentTimeline } from '../types';
import { t } from '../i18n';
import { Button, Empty, Loading, Notice } from './ui';
import { SrcConversationRow } from './objects/src-conversation/Row';

export default function SourceConversations({ accountId }: { accountId: string }) {
  const activity = agentActivity.use();
  const [rows, setRows] = useState<SrcConversation[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false, reading = false;
    async function read() {
      if (reading) return;
      reading = true;
      try {
        const result = await srcConversationsApi.list(accountId);
        if (!stopped) { setRows(result.accounts.flatMap(account => account.conversations)); setError(''); }
      } catch (error) { if (!stopped) setError(String(error)); }
      finally { reading = false; if (!stopped) setLoading(false); }
    }
    void read();
    const timer = setInterval(() => { if (!document.hidden) void read(); }, 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [accountId, retry]);
  async function open(task: SrcConversation['taskRefs'][number]) {
    const live = agentActivity.get().snapshot?.agents[task.agent]?.sessions.find(session => session.id === task.id);
    let accountId = live?.agentAccountId;
    if (!live) {
      try { accountId = (await api<AgentTimeline>('agents/conversations/timeline', 'POST', { agent: task.agent, id: task.id })).dispatchSummary?.agentAccountId; }
      catch (error) { setError(String(error)); return; }
    }
    selectAgentPanel({ type: 'task', agent: task.agent, session: {
      ...(live ?? { id: task.id, source: task.agent === 'codex' ? 'codex-thread' : 'arc-task', phase: 'idle', phaseSince: null, headline: '', timeline: true }),
      agentAccountId: accountId, conversation: true, orderAt: Date.now(),
    } });
  }
  return <div className="grid gap-2">
    {loading && <Loading />}
    {error && <Notice action={<Button onClick={() => setRetry(value => value + 1)}>{t('retry')}</Button>}>{error}</Notice>}
    {rows.map(row => <SrcConversationRow key={`${row.kind}:${row.id}`} conversation={{ ...row, taskRefs: row.taskRefs.map(task => ({ ...task, title: activity.snapshot?.agents[task.agent]?.sessions.find(session => session.id === task.id)?.title || task.title })) }} onTask={open} />)}
    {!loading && !error && !rows.length && <Empty icon={MessagesSquare}>{t('panels.noConversations')}</Empty>}
  </div>;
}
