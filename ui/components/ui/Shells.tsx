import { Slot } from "radix-ui";
import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight, Copy, Check, Eye, EyeOff, RefreshCw, LoaderCircle, type LucideIcon } from 'lucide-react';
import { t } from '../../i18n';
import { Button, Icon, IconButton, Status } from './index';
import './Shells.css';

export type StatePresentation = { tone: 'neutral' | 'success' | 'warning' | 'danger'; labelKey: string; icon: LucideIcon };
export function StateBadge({ presentation, label, variant = 'badge', className = '' }: {
  presentation: StatePresentation; label?: string; variant?: 'badge' | 'dot' | 'compact' | 'text'; className?: string;
}) {
  const text = label ?? t(presentation.labelKey);
  if (variant === 'badge') return <Status tone={presentation.tone}>{text}</Status>;
  return <span className={`state-badge ${presentation.tone} ${className}`} data-variant={variant}
    role={variant === 'dot' ? 'img' : undefined} aria-label={variant === 'dot' ? text : undefined}>
    {variant === 'dot' ? <span className="status-dot" aria-hidden="true" /> : <>{variant === 'compact' && <Icon icon={presentation.icon} />}{text}</>}
  </span>;
}

export function SectionHeader({ title, level, count, leading, actions, back, close, widthControl, secondary, children, className = '', titleProps, titleActions, titleAsChild = false, ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode; level: 1 | 2 | 3 | 4; count?: number; leading?: ReactNode; actions?: ReactNode;
  back?: ReactNode; close?: ReactNode; widthControl?: ReactNode; secondary?: ReactNode;
  titleProps?: HTMLAttributes<HTMLHeadingElement>; titleActions?: ReactNode; titleAsChild?: boolean;
}) {
  const Heading = `h${level}` as const;
  return <header {...props} className={`section-header ${className}`}>
    {back}{leading}<div className="section-header-copy"><div className="section-header-title">{titleAsChild ? title : <Heading {...titleProps}>{title}{count !== undefined && <span className="section-header-count">{count}</span>}</Heading>}{titleActions}</div>{secondary}</div>
    {(actions || widthControl || close) && <div className="actions">{actions}{widthControl}{close}</div>}{children}
  </header>;
}

export function EntityRow({ leading, title, secondary, state, actions, chevron, selected, onClick, href, children, className = '', ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  leading?: ReactNode; title?: ReactNode; secondary?: ReactNode; state?: ReactNode; actions?: ReactNode;
  chevron?: boolean; selected?: boolean; href?: string; disabled?: boolean;
}) {
  const Copy = onClick || href ? "span" : "div";
  const content = <>{leading}{children ?? <Copy className="entity-row-copy"><Copy className="entity-row-title">{title}</Copy>{secondary != null && <Copy className="entity-row-secondary">{secondary}</Copy>}</Copy>}{state}{chevron && <Icon icon={ChevronRight} />}</>;
  const classes = `entity-row ${className}`;
  // The navigation target and independent actions are siblings, never nested buttons.
  const target = href ? <a {...props} className={classes} href={props.disabled ? undefined : href} onClick={event => { if (props.disabled) event.preventDefault(); else onClick?.(event); }} aria-disabled={props.disabled || undefined} aria-current={selected ? 'true' : undefined}>{content}</a>
    : onClick ? <Button {...props} variant="ghost" className={classes} aria-current={selected ? 'true' : undefined} onClick={onClick}>{content}</Button>
    : <div {...props} className={classes} aria-current={selected ? 'true' : undefined}>{content}</div>;
  return actions ? <div className={`entity-row-actions ${className}`}>{target}<div className="actions">{actions}</div></div> : target;
}

export function EntityCard({ icon, title, level = 3, headerActions, footer, danger, children, className = '', asChild = false, ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  asChild?: boolean; icon?: ReactNode; title?: ReactNode; level?: 1 | 2 | 3 | 4; headerActions?: ReactNode; footer?: ReactNode; danger?: ReactNode;
}) {
  if (asChild) return <Slot.Root {...props} className={`entity-card ${className}`}>{children}</Slot.Root>;
  return <section {...props} className={`entity-card ${className}`}>
    {title != null && <SectionHeader title={title} level={level} leading={icon} actions={headerActions} />}
    {children}{footer && <footer>{footer}</footer>}{danger && <div className="entity-card-danger">{danger}</div>}
  </section>;
}

export function FactList({ items, missing, className = '' }: {
  items: readonly { label: ReactNode; value?: ReactNode; key?: string }[];
  missing: { omit: true } | { placeholder: ReactNode }; className?: string;
}) {
  return <dl className={`fact-list ${className}`}>{items.map(({ label, value, key }, index) => {
    const absent = value === undefined || value === null || value === '';
    return absent && 'omit' in missing ? null : <div key={key ?? index}><dt>{label}</dt><dd>{absent && 'placeholder' in missing ? missing.placeholder : value}</dd></div>;
  })}</dl>;
}

export function Freshness({ observedAt, age, unknown = '—', timestampLabel, label, stale, onRefresh, busy, disabled, refreshLabel, className = '' }: {
  observedAt?: string | null; age: ReactNode; unknown?: ReactNode; timestampLabel?: string; label?: string;
  stale?: boolean; onRefresh?: () => void; busy?: boolean; disabled?: boolean; refreshLabel?: string; className?: string;
}) {
  const valid = !!observedAt && Number.isFinite(Date.parse(observedAt));
  return <span className={`freshness ${className}`} data-stale={stale || undefined}>
    <time dateTime={valid ? observedAt : undefined} title={valid ? timestampLabel : undefined} aria-label={label}>{valid ? age : unknown}</time>
    {onRefresh && <IconButton icon={RefreshCw} label={refreshLabel ?? t('refresh')} busy={busy} disabled={disabled} onClick={onRefresh} />}
  </span>;
}

export function AddressField({ label, value, display, revealed, onReveal, onCopy, loading, disabled, copied, error, placeholder = '' }: {
  label: string; value: string; display: ReactNode; revealed?: boolean; onReveal?: () => void;
  onCopy: (raw: string) => void; loading?: boolean; disabled?: boolean; copied?: boolean; error?: string; placeholder?: string;
}) {
  return <div><div className="copy-field">
    <div className="input copy-value" role="textbox" aria-readonly="true" aria-label={label} aria-busy={loading} tabIndex={0}
      onCopyCapture={event => { event.preventDefault(); event.stopPropagation(); if (!disabled && !loading && value) event.clipboardData.setData('text/plain', value); }}>
      {value ? display : placeholder}
    </div>
    {loading ? <Icon icon={LoaderCircle} className="spin" /> : <>
      {onReveal && <IconButton icon={revealed ? EyeOff : Eye} label={t(revealed ? 'hideSecret' : 'showSecret')} disabled={disabled || !value} onClick={onReveal} />}
      <IconButton icon={copied ? Check : Copy} label={t(copied ? 'copied' : 'copy')} disabled={disabled || !value} onClick={() => onCopy(value)} />
    </>}
  </div>{error && <p className="field-error" role="alert">{error}</p>}{copied && <span className="sr-only" role="status">{t('copied')}</span>}</div>;
}
