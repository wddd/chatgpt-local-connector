import { useEffect, useRef, type ReactNode, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ActionGroup, EntityCard, IconButton, Notice, SectionHeader } from '../ui';
import { t } from '../../i18n';

/** Presentation only. Each request adapter owns its decision protocol. Dialog owns overlay focus/Escape. */
export type RequestCardProps = {
  title: string; children?: ReactNode; context?: ReactNode; leading?: ReactNode; state?: ReactNode; error?: string;
  footer?: ReactNode; busy?: boolean; disabled?: boolean; inline?: boolean;
  formId?: string; onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  focusKey?: string; pager?: { index: number; count: number; onChange: (index: number) => void };
  onClose?: () => void;
};
export function RequestCard({ title, children, context, leading, state, error, footer, busy, disabled, inline, formId, onSubmit, focusKey, pager, onClose }: RequestCardProps) {
  const focus = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focusKey) focus.current?.focus({ preventScroll: true }); }, [focusKey]);
  const contents = <>
    <SectionHeader level={3} leading={leading} title={title} actions={<>
      {pager && pager.count > 1 && <ActionGroup><IconButton icon={ChevronLeft} label={t('detail.previousRequest')} disabled={pager.index === 0} onClick={() => pager.onChange(pager.index - 1)} /><span>{t('detail.pager', { current: pager.index + 1, total: pager.count })}</span><IconButton icon={ChevronRight} label={t('detail.nextRequest')} disabled={pager.index === pager.count - 1} onClick={() => pager.onChange(pager.index + 1)} /></ActionGroup>}
      {onClose && <IconButton icon={X} label={t('close')} onClick={onClose} />}
    </>} />
    {context}<div className="request-card-body grid min-w-0 content-start gap-3 [.task-needs-you_&]:min-h-[6lh] [.task-needs-you_&]:flex-auto [.task-needs-you_&]:overflow-y-auto [.task-needs-you_&]:overscroll-y-contain" ref={focus} tabIndex={focusKey ? -1 : undefined}>{children}</div>
    {state && <div role="status">{state}</div>}{error && <Notice tone="danger">{error}</Notice>}
    {footer && <fieldset className="request-card-response m-0 min-w-0 border-0 p-0" disabled={busy || disabled}><ActionGroup>{footer}</ActionGroup></fieldset>}
  </>;
  return onSubmit ? <EntityCard asChild><form id={formId} className="request-card flex min-h-auto min-w-0 max-w-full flex-col wrap-anywhere data-inline:rounded-none data-inline:border-0 data-inline:bg-transparent data-inline:p-0 [&>*]:shrink-0 [.task-needs-you>&]:min-h-0 [.task-needs-you>&]:flex-auto [.task-needs-you>&]:overflow-y-auto [.task-needs-you>&]:overscroll-y-contain" data-inline={inline || undefined} aria-busy={busy} onSubmit={onSubmit}>{contents}</form></EntityCard>
    : <EntityCard className="request-card flex min-h-auto min-w-0 max-w-full flex-col wrap-anywhere data-inline:rounded-none data-inline:border-0 data-inline:bg-transparent data-inline:p-0 [&>*]:shrink-0 [.task-needs-you>&]:min-h-0 [.task-needs-you>&]:flex-auto [.task-needs-you>&]:overflow-y-auto [.task-needs-you>&]:overscroll-y-contain" data-inline={inline || undefined} aria-busy={busy}>{contents}</EntityCard>;
}
