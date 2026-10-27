import { MessageSquare } from 'lucide-react';
import type { SrcConversation } from '../../../srcConversations';
import { name } from '../../../state/agents';
import { Disclosure, EntityRow, Icon } from '../../ui';

export function SrcConversationRow({ conversation, onTask }: {
  conversation: SrcConversation; onTask: (task: SrcConversation['taskRefs'][number]) => void;
}) {
  const title = `${conversation.kind === 'cowork' ? 'Cowork' : 'Chat'} · ${conversation.id}`;
  const tasks = conversation.taskRefs;
  const row = <EntityRow leading={<Icon icon={MessageSquare} />} title={title}
    secondary={new Date(conversation.lastActiveAt ?? conversation.lastSeenAt).toLocaleString()}
    onClick={tasks.length === 1 ? () => onTask(tasks[0]) : undefined} chevron={tasks.length === 1} />;
  return tasks.length > 1 ? <Disclosure title={title}>
    {tasks.map(task => <EntityRow key={`${task.agent}:${task.id}`} title={`${name({ agent: task.agent })} · ${task.id}`} onClick={() => onTask(task)} chevron />)}
  </Disclosure> : row;
}
