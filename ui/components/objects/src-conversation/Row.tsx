import { MessageSquare } from 'lucide-react';
import type { SrcConversation } from '../../../srcConversations';
import { t, locale } from '../../../i18n';
import { name } from '../../../state/agents';
import { Disclosure, EntityRow, Icon } from '../../ui';

export function SrcConversationRow({ conversation, onTask }: {
  conversation: SrcConversation; onTask: (task: SrcConversation['taskRefs'][number]) => void;
}) {
  const time = new Date(conversation.lastActiveAt ?? conversation.lastSeenAt).toLocaleString(locale.get());
  const readable = (title: string | undefined, id: string) => {
    const value = title?.trim();
    return value && value !== id && !/^(?:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}|(?:cse|session)_[\w-]+)$/i.test(value) ? value : undefined;
  };
  const givenTitle = readable(conversation.title, conversation.id);
  const title = givenTitle ?? `${conversation.kind === 'cowork' ? 'Cowork' : 'Chat'} · ${time}`;
  const tasks = conversation.taskRefs;
  const row = <EntityRow leading={<Icon icon={MessageSquare} />} title={title}
    secondary={givenTitle ? time : undefined}
    onClick={tasks.length === 1 ? () => onTask(tasks[0]) : undefined} chevron={tasks.length === 1} />;
  return tasks.length > 1 ? <Disclosure title={title}>
    {tasks.map((task, index) => <EntityRow key={`${task.agent}:${task.id}`} title={readable(task.title, task.id) ?? t('panels.relatedTask', { agent: name({ agent: task.agent }), number: index + 1 })} onClick={() => onTask(task)} chevron />)}
  </Disclosure> : row;
}
