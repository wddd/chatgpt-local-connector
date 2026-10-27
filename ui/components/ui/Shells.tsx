import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight, Copy, Check, Eye, EyeOff, RefreshCw, LoaderCircle, type LucideIcon } from 'lucide-react';
import { t } from '../../i18n';
import { Button, Icon, IconButton, Status } from './index';
import { cn } from '../../lib/utils';
import { Card } from './card';
import { toneClasses } from './index';

export type StatePresentation = { tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; labelKey: string; icon: LucideIcon };
export function StateBadge({ presentation, label, variant = 'badge', className = '' }: {
  presentation: StatePresentation; label?: string; variant?: 'badge' | 'dot' | 'compact' | 'text'; className?: string;
}) {
  const text = label ?? t(presentation.labelKey);
  if (variant === 'badge') return <Status tone={presentation.tone}>{text}</Status>;
  return <span className={cn("state-badge inline-flex items-center gap-1 whitespace-nowrap text-xs", toneClasses[presentation.tone], variant === "compact" && "rounded-full bg-secondary px-2 py-1", variant === "compact" && ({ neutral: "bg-secondary", accent: "bg-task-live-soft", success: "bg-success-soft", warning: "bg-warning-soft", danger: "bg-danger-soft" })[presentation.tone], className)} data-variant={variant}
    role={variant === 'dot' ? 'img' : undefined} aria-label={variant === 'dot' ? text : undefined}>
    {variant === 'dot' ? <span className="status-dot size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" /> : <>{variant === 'compact' && <Icon icon={presentation.icon} />}{text}</>}
  </span>;
}

export function SectionHeader({ title, level, count, leading, actions, back, close, widthControl, secondary, children, className = '', titleProps, titleActions, titleAsChild = false, ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode; level: 1 | 2 | 3 | 4; count?: number; leading?: ReactNode; actions?: ReactNode;
  back?: ReactNode; close?: ReactNode; widthControl?: ReactNode; secondary?: ReactNode;
  titleProps?: HTMLAttributes<HTMLHeadingElement>; titleActions?: ReactNode; titleAsChild?: boolean;
}) {
  const Heading = `h${level}` as const;
  return <header data-leading={!!(leading || back)} {...props} className={cn("section-header group/context flex min-w-0 items-center justify-between gap-3", className)}>
    {back}{leading}<div className="section-header-copy min-w-0 flex-1"><div className="section-header-title flex min-w-0 items-center gap-1 [&>h1]:min-w-0 [&>h2]:min-w-0 [&>h3]:min-w-0 [&>h4]:min-w-0">{titleAsChild ? title : <Heading {...titleProps} className={cn("m-0 text-inherit", titleProps?.className)}>{title}{count !== undefined && <span className="section-header-count ms-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>}</Heading>}{titleActions}</div>{secondary}</div>
    {(actions || widthControl || close) && <div className="actions ms-auto flex shrink-0 flex-wrap items-center gap-2">{actions}{widthControl}{close}</div>}{children}
  </header>;
}

export function EntityRow({ leading, title, secondary, state, actions, chevron, selected, attention, onClick, href, children, className = '', ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  leading?: ReactNode; title?: ReactNode; secondary?: ReactNode; state?: ReactNode; actions?: ReactNode;
  chevron?: boolean; selected?: boolean; attention?: boolean; href?: string; disabled?: boolean;
}) {
  const Copy = onClick || href ? "span" : "div";
  const content = <>{leading}{children ?? <Copy className="entity-row-copy grid min-w-0 flex-1 content-start gap-1.25"><Copy className="entity-row-title min-w-0 overflow-hidden text-ellipsis font-semibold">{title}</Copy>{secondary != null && <Copy className="entity-row-secondary min-w-0 overflow-hidden text-ellipsis text-sm text-muted-foreground">{secondary}</Copy>}</Copy>}{state}{chevron && <Icon icon={ChevronRight} />}</>;
  const classes = cn("entity-row flex h-auto w-full min-w-0 flex-1 items-center gap-3 whitespace-normal p-3 text-start data-[attention]:border data-[attention]:border-warning aria-[current=true]:bg-accent", className);
  // The navigation target and independent actions are siblings, never nested buttons.
  const target = href ? <a {...props} className={classes} data-attention={attention || undefined} href={props.disabled ? undefined : href} onClick={event => { if (props.disabled) event.preventDefault(); else onClick?.(event); }} aria-disabled={props.disabled || undefined} aria-current={selected ? 'true' : undefined}>{content}</a>
    : onClick ? <Button {...props} variant="ghost" className={classes} data-attention={attention || undefined} aria-current={selected ? 'true' : undefined} onClick={onClick}>{content}</Button>
    : <div {...props} className={classes} data-attention={attention || undefined} aria-current={selected ? 'true' : undefined}>{content}</div>;
  return actions ? <div className={cn("entity-row-actions flex min-w-0 items-center", className)}>{target}<div className="actions ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div></div> : target;
}

export function EntityCard({ icon, title, level = 3, headerActions, footer, danger, children, className = '', variant = 'surface', asChild = false, ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  asChild?: boolean; variant?: 'surface' | 'outline'; icon?: ReactNode; title?: ReactNode; level?: 1 | 2 | 3 | 4; headerActions?: ReactNode; footer?: ReactNode; danger?: ReactNode;
}) {
  const classes = cn("entity-card grid min-w-0 grid-cols-1 content-start gap-3 break-words rounded-lg border bg-card p-4 text-card-foreground shadow-none [&>*]:min-w-0 [&>*]:max-w-full [&_h3]:m-0 [&_h3]:text-base", variant === "outline" && "rounded-card bg-transparent", className);
  if (asChild) return <Card asChild {...props} className={classes} data-variant={variant}>{children}</Card>;
  return <Card asChild className={classes}><section {...props} data-variant={variant}>
    {title != null && <SectionHeader title={title} level={level} leading={icon} actions={headerActions} />}
    {children}{footer && <footer>{footer}</footer>}{danger && <div className="entity-card-danger border-t pt-4">{danger}</div>}
  </section></Card>;
}

export function FactList({ items, missing, className = '' }: {
  items: readonly { label: ReactNode; value?: ReactNode; key?: string }[];
  missing: { omit: true } | { placeholder: ReactNode }; className?: string;
}) {
  return <dl className={cn("fact-list m-0 flex flex-wrap gap-6", className)}>{items.map(({ label, value, key }, index) => {
    const absent = value === undefined || value === null || value === '';
    return absent && 'omit' in missing ? null : <div className="min-w-0 flex-1 basis-35" key={key ?? index}><dt className="mb-2 text-xs text-muted-foreground">{label}</dt><dd className="m-0 break-words">{absent && 'placeholder' in missing ? missing.placeholder : value}</dd></div>;
  })}</dl>;
}

export function Freshness({ observedAt, age, unknown = '—', timestampLabel, label, stale, onRefresh, busy, disabled, refreshLabel, className = '' }: {
  observedAt?: string | null; age: ReactNode; unknown?: ReactNode; timestampLabel?: string; label?: string;
  stale?: boolean; onRefresh?: () => void; busy?: boolean; disabled?: boolean; refreshLabel?: string; className?: string;
}) {
  const valid = !!observedAt && Number.isFinite(Date.parse(observedAt));
  return <span className={cn("freshness inline-flex shrink-0 items-center gap-1.75 whitespace-nowrap tabular-nums", className)} data-stale={stale || undefined}>
    <time dateTime={valid ? observedAt : undefined} title={valid ? timestampLabel : undefined} aria-label={label}>{valid ? age : unknown}</time>
    {onRefresh && <IconButton icon={RefreshCw} label={refreshLabel ?? t('refresh')} busy={busy} disabled={disabled} onClick={onRefresh} />}
  </span>;
}

export function AddressField({ label, value, display, revealed, onReveal, onCopy, loading, disabled, copied, error, placeholder = '' }: {
  label: string; value: string; display: ReactNode; revealed?: boolean; onReveal?: () => void;
  onCopy: (raw: string) => void; loading?: boolean; disabled?: boolean; copied?: boolean; error?: string; placeholder?: string;
}) {
  return <div><div className="copy-field [&_.input]:font-mono [&_.input]:text-xs flex min-w-0 items-center gap-1">
    <div className="copy-value flex-1 overflow-hidden whitespace-nowrap min-h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1.5 font-mono text-xs text-foreground" role="textbox" aria-readonly="true" aria-label={label} aria-busy={loading} tabIndex={0}
      onCopyCapture={event => { event.preventDefault(); event.stopPropagation(); if (!disabled && !loading && value) event.clipboardData.setData('text/plain', value); }}>
      {value ? display : placeholder}
    </div>
    {loading ? <Icon icon={LoaderCircle} className="spin animate-spin" /> : <>
      {onReveal && <IconButton icon={revealed ? EyeOff : Eye} label={t(revealed ? 'hideSecret' : 'showSecret')} disabled={disabled || !value} onClick={onReveal} />}
      <IconButton icon={copied ? Check : Copy} label={t(copied ? 'copied' : 'copy')} disabled={disabled || !value} onClick={() => onCopy(value)} />
    </>}
  </div>{error && <p className="field-error text-xs text-destructive" role="alert">{error}</p>}{copied && <span className="sr-only" role="status">{t('copied')}</span>}</div>;
}
