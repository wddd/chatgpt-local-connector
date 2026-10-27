import type { ComponentProps } from 'react';
import { IconButton, Tooltip } from '../ui';
import { cn } from '../../lib/utils';

export function ContextIcon({ revealed = true, className, ...props }: ComponentProps<typeof IconButton> & { revealed?: boolean }) {
  return <Tooltip text={props.label}><IconButton {...props} className={cn(!revealed && 'opacity-0 group-hover/context:opacity-100 group-focus-within/context:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100', className)} /></Tooltip>;
}
