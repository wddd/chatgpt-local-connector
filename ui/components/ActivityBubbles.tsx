import type { ComponentProps } from 'react';
import { updates } from '../state/updates';
import { updateBlocks } from '../state/updateModel';
import { selectAgentPanel } from '../state/overviewPanels';
import { TaskNode } from './objects/task/Node';
export { ActivityBubbleContent, elapsed } from './objects/task/Content';

export function ActivityBubble(props: Omit<ComponentProps<typeof TaskNode>, 'blocking' | 'onOpen'>) {
  const blocking = updateBlocks(updates.use().snapshot, props.agent, props.session.id);
  return <TaskNode {...props} blocking={blocking} onOpen={() => selectAgentPanel({ type: 'task', agent: props.agent, session: props.session })} />;
}
