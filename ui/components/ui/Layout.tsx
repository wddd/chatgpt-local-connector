import { Slot } from 'radix-ui';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Button } from './index';
import { cn } from '../../lib/utils';

const pageInset = 'px-6 max-sm:px-4';

/** Functional pages share one inset for their title bar and scrollable content. */
export function FunctionalPage({ header, children }: { header: ReactNode; children: ReactNode }) {
  return <>
    <header className={cn('sheet-header flex min-h-13 shrink-0 items-center gap-3 border-b py-2', pageInset)}>{header}</header>
    <main className={cn('workspace m-0 min-h-0 w-full max-w-none flex-1 overflow-auto overscroll-contain py-6 max-sm:py-5 [&>.settings-page]:m-0 [&>.settings-page]:w-full [&>.settings-page]:max-w-none', pageInset)}>{children}</main>
  </>;
}

/** A retained panel view. Hidden views keep their component state and effects. */
export function ViewStack({ asChild = false, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { asChild?: boolean; ref?: Ref<HTMLDivElement> }) {
  const Root = asChild ? Slot.Root : 'div';
  return <Root {...props} className={cn("view-stack flex size-full min-h-0 flex-col", className)} />;
}

/** An interactive segment in a proportional meter; the owner supplies its data and events. */
export function MeterSegment({ weight, style, ...props }: Parameters<typeof Button>[0] & { weight: number }) {
  return <Button {...props} style={{ ...style, flexGrow: weight }} />;
}
