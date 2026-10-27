import type { ComponentProps } from 'react';
import { Reference } from '../Reference';
import { StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { taskIdentity, type TaskReference } from './projection';

export function TaskChip({ task, ...props }: Omit<ComponentProps<typeof Reference>, 'children'> & { task: TaskReference }) {
  const identity = taskIdentity(task);
  return <Reference {...props}><span>{identity.title}</span><StateBadge variant="dot" presentation={statePresentation(task.kind === 'receipt' ? 'dispatch' : 'task', identity.state)} /></Reference>;
}
