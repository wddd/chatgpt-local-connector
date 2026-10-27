import { isValidElement, useId, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { Collapsible as CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from './collapsible';
import { Field, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend } from './field';
import { Label } from './label';
import { cn } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Icon, SingleChoice } from './index';
import { HoverScope } from './HoverScope';

export function SettingsSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className="settings-section @container grid min-w-0 gap-3 [&+section]:mt-8" aria-labelledby={id}>
    <header className="grid gap-1 [&>p]:text-xs [&>p]:text-muted-foreground"><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</header>
    <div className="settings-section-body min-w-0">{children}</div>
  </section>;
}

type SettingRowProps = { label: ReactNode; description?: ReactNode; controlId?: string; id?: string } & (
  { onNavigate: () => void; disabled?: boolean; children?: never } |
  { onNavigate?: never; disabled?: never; children?: ReactNode }
);
export function SettingRow({ label, description, children, controlId, id, onNavigate, disabled }: SettingRowProps) {
  const copy = <><span className="setting-row-label font-medium">{label}</span>{description && <span className="setting-row-description text-xs text-muted-foreground">{description}</span>}</>;
  const grid = 'grid w-full min-w-0 grid-cols-2 items-center gap-x-6 gap-y-3 px-0 py-4 @max-settings:has-[.choice,.action-group,.input]:grid-cols-1';
  const content = <>
    {controlId ? <Label className="setting-row-copy grid min-w-0 gap-1 text-start" htmlFor={controlId}>{copy}</Label> : <div className="setting-row-copy grid min-w-0 gap-1 text-start">{copy}</div>}
    <div className="setting-row-control flex min-w-0 justify-end [&>.choice]:w-full [&>.choice]:flex [&>.choice]:justify-end">{onNavigate ? <Icon icon={ChevronRight} /> : children}</div>
  </>;
  return <div className="setting-row border-b last:border-0" id={onNavigate ? undefined : id}>
    {onNavigate ? <HoverScope><Button className={grid} id={id} variant="surface" disabled={disabled} data-hover-target="navigation" onClick={onNavigate}>{content}</Button></HoverScope> : <div className={grid}>{content}</div>}
  </div>;
}

export function FormField({ id, label, help, error, children }: { id?: string; label: ReactNode; help?: ReactNode; error?: string; children: ReactNode }) {
  const generated = useId(), fieldId = id ?? generated;
  const linked = !!id && isValidElement(children);
  const description = [help && `${fieldId}-help`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;
  return <Field className="form-field grid min-w-0 gap-2" role={linked ? undefined : 'group'} aria-labelledby={linked ? undefined : `${fieldId}-label`} aria-describedby={linked ? undefined : description}>
    <FieldLabel id={`${fieldId}-label`} htmlFor={linked ? id : undefined}>{label}</FieldLabel>
    {linked ? <Slot.Root id={id} aria-invalid={!!error || undefined} aria-describedby={description}>{children}</Slot.Root> : children}
    {help && <FieldDescription className="form-field-help text-xs" id={`${fieldId}-help`}>{help}</FieldDescription>}
    {error && <FieldError className="field-error text-xs" id={`${fieldId}-error`} role="alert">{error}</FieldError>}
  </Field>;
}
export function FormSection({ title, description, children }: { title?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return <FieldSet className="form-section m-0 grid min-w-0 gap-4 border-0 p-0">{title && <FieldLegend className="mb-0 pb-3 font-semibold">{title}</FieldLegend>}{description && <p className="form-field-help text-xs text-muted-foreground">{description}</p>}{children}</FieldSet>;
}
export function ActionGroup({ align = 'trailing', children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { align?: 'leading' | 'trailing' }) {
  return <div {...props} className={cn("action-group flex min-w-0 flex-wrap items-center gap-2 [&>.button]:h-auto [&>.button]:max-w-full [&>.button]:whitespace-normal", align === "leading" ? "justify-start" : "justify-end", className)} data-align={align}>{children}</div>;
}
export function Disclosure({ title, children, open, defaultOpen, onOpenChange, disabled }: {
  title: ReactNode; children: ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; disabled?: boolean;
}) {
  return <CollapsibleRoot className="disclosure" open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} disabled={disabled}>
    <CollapsibleTrigger asChild><Button variant="ghost" className="disclosure-trigger gap-2 [&>.icon]:-rotate-90 [&>.icon]:transition-transform data-[state=open]:[&>.icon]:rotate-0 motion-reduce:[&>.icon]:transition-none"><Icon icon={ChevronDown} />{title}</Button></CollapsibleTrigger>
    <CollapsibleContent className="disclosure-content data-[state=open]:grid data-[state=open]:gap-4 data-[state=open]:pt-3">{children}</CollapsibleContent>
  </CollapsibleRoot>;
}
export function DangerZone({ consequence, children }: { consequence: ReactNode; children: ReactNode }) {
  const id = useId();
  return <div className="danger-zone mt-6 grid gap-3 border-t pt-4 [&>p]:text-xs [&>p]:text-muted-foreground" role="group" aria-describedby={id}><p id={id}>{consequence}</p><ActionGroup align="leading">{children}</ActionGroup></div>;
}

/** Settings with no decision to make are values, not interactive selectors. */
export function ChoiceControl(props: ComponentProps<typeof SingleChoice>) {
  if (props.options.length > 1) return <SingleChoice {...props} />;
  const selected = props.options.find(option => option.value === props.value);
  const value = selected?.label || props.value || '—';
  return <span className="choice-static inline-flex min-w-0 items-center gap-2 break-words" aria-label={`${props.label}: ${value}`}>
    {selected?.graphic}{selected?.icon && <Icon icon={selected.icon} />}{value}
    {(props.cards || props.navigation) && selected?.description && <span className="form-field-help text-xs text-muted-foreground">{selected.description}</span>}
    {selected?.warning && <span className="text-warning">{selected.warning}</span>}
  </span>;
}
