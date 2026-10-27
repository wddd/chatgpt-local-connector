import type { ReactNode } from 'react';
import { Button } from '../ui';

/** Inline references never infer a navigation target from a display name. */
export function Reference({ children, onOpen, disabled, selected, attention, label, referenceId }: {
  children: ReactNode; onOpen?: () => void; disabled?: boolean; selected?: boolean; attention?: boolean; label?: string; referenceId?: string;
}) {
  const props = { className: 'object-chip inline-flex h-auto min-w-0 max-w-full items-center gap-2 whitespace-normal text-start align-middle wrap-anywhere aria-[current=true]:bg-accent data-[attention]:ring-1 data-[attention]:ring-inset data-[attention]:ring-warning [&_.platform-icon]:shrink-0', 'data-object-reference': referenceId, 'aria-label': label, 'data-attention': attention || undefined, 'aria-current': selected ? 'true' as const : undefined };
  return onOpen ? <Button {...props} variant="ghost" disabled={disabled} onClick={onOpen}>{children}</Button>
    : <span {...props} aria-disabled={disabled || undefined}>{children}</span>;
}
