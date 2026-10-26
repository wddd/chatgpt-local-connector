import { isValidElement, useId, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { Collapsible, Slot } from 'radix-ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Icon, SingleChoice } from './index';
import { HoverScope } from './HoverScope';
import './Forms.css';

export function SettingsSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className="settings-section" aria-labelledby={id}>
    <header><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</header>
    <div className="settings-section-body">{children}</div>
  </section>;
}

type SettingRowProps = { label: ReactNode; description?: ReactNode; controlId?: string; id?: string } & (
  { onNavigate: () => void; disabled?: boolean; children?: never } |
  { onNavigate?: never; disabled?: never; children?: ReactNode }
);
export function SettingRow({ label, description, children, controlId, id, onNavigate, disabled }: SettingRowProps) {
  const copy = <><span className="setting-row-label">{label}</span>{description && <span className="setting-row-description">{description}</span>}</>;
  if (onNavigate) return <div className="setting-row setting-row-navigation"><HoverScope>
    <Button id={id} variant="ghost" disabled={disabled} data-hover-target="navigation" onClick={onNavigate}>
      <span className="setting-row-copy">{copy}</span><Icon icon={ChevronRight} />
    </Button>
  </HoverScope></div>;
  return <div className="setting-row" id={id}>
    {controlId ? <label className="setting-row-copy" htmlFor={controlId}>{copy}</label> : <div className="setting-row-copy">{copy}</div>}
    <div className="setting-row-control">{children}</div>
  </div>;
}

export function FormField({ id, label, help, error, children }: { id?: string; label: ReactNode; help?: ReactNode; error?: string; children: ReactNode }) {
  const generated = useId(), fieldId = id ?? generated;
  const linked = !!id && isValidElement(children);
  const description = [help && `${fieldId}-help`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="form-field" role={linked ? undefined : 'group'} aria-labelledby={linked ? undefined : `${fieldId}-label`} aria-describedby={linked ? undefined : description}>
    <label id={`${fieldId}-label`} htmlFor={linked ? id : undefined}>{label}</label>
    {linked ? <Slot.Root id={id} aria-invalid={!!error || undefined} aria-describedby={description}>{children}</Slot.Root> : children}
    {help && <div className="form-field-help" id={`${fieldId}-help`}>{help}</div>}
    {error && <p className="field-error" id={`${fieldId}-error`} role="alert">{error}</p>}
  </div>;
}
export function FormSection({ title, description, children }: { title?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return <fieldset className="form-section">{title && <legend>{title}</legend>}{description && <p className="form-field-help">{description}</p>}{children}</fieldset>;
}
export function ActionGroup({ align = 'trailing', children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { align?: 'leading' | 'trailing' }) {
  return <div {...props} className={`action-group ${className}`} data-align={align}>{children}</div>;
}
export function Disclosure({ title, children, open, defaultOpen, onOpenChange, disabled }: {
  title: ReactNode; children: ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; disabled?: boolean;
}) {
  return <Collapsible.Root className="disclosure" open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} disabled={disabled}>
    <Collapsible.Trigger asChild><Button variant="ghost" className="disclosure-trigger"><Icon icon={ChevronDown} />{title}</Button></Collapsible.Trigger>
    <Collapsible.Content className="disclosure-content">{children}</Collapsible.Content>
  </Collapsible.Root>;
}
export function DangerZone({ consequence, children }: { consequence: ReactNode; children: ReactNode }) {
  const id = useId();
  return <div className="danger-zone" role="group" aria-describedby={id}><p id={id}>{consequence}</p><ActionGroup align="leading">{children}</ActionGroup></div>;
}

/** Settings with no decision to make are values, not interactive selectors. */
export function ChoiceControl(props: ComponentProps<typeof SingleChoice>) {
  if (props.options.length > 1) return <SingleChoice {...props} />;
  const selected = props.options.find(option => option.value === props.value);
  const value = selected?.label || props.value || '—';
  return <span className="choice-static" aria-label={`${props.label}: ${value}`}>
    {selected?.graphic}{selected?.icon && <Icon icon={selected.icon} />}{value}
    {(props.cards || props.navigation) && selected?.description && <span className="form-field-help">{selected.description}</span>}
    {selected?.warning && <span className="choice-warning">{selected.warning}</span>}
  </span>;
}
