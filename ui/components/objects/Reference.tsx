import type { ReactNode } from 'react';
import { Button } from '../ui';
import './objects.css';

/** Inline references never infer a navigation target from a display name. */
export function Reference({ children, onOpen, disabled, selected, attention, label, referenceId }: {
  children: ReactNode; onOpen?: () => void; disabled?: boolean; selected?: boolean; attention?: boolean; label?: string; referenceId?: string;
}) {
  const props = { className: 'object-chip', 'data-object-reference': referenceId, 'aria-label': label, 'data-attention': attention || undefined, 'aria-current': selected ? 'true' as const : undefined };
  return onOpen ? <Button {...props} variant="ghost" disabled={disabled} onClick={onOpen}>{children}</Button>
    : <span {...props} aria-disabled={disabled || undefined}>{children}</span>;
}
