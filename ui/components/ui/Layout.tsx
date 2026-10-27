import { Slot } from 'radix-ui';
import type { HTMLAttributes, Ref } from 'react';
import { Button } from './index';
import { cn } from '../../lib/utils';

/** A retained panel view. Hidden views keep their component state and effects. */
export function ViewStack({ asChild = false, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { asChild?: boolean; ref?: Ref<HTMLDivElement> }) {
  const Root = asChild ? Slot.Root : 'div';
  return <Root {...props} className={cn("view-stack flex size-full min-h-0 flex-col", className)} />;
}

/** An interactive segment in a proportional meter; the owner supplies its data and events. */
export function MeterSegment({ weight, style, ...props }: Parameters<typeof Button>[0] & { weight: number }) {
  return <Button {...props} style={{ ...style, flexGrow: weight }} />;
}
