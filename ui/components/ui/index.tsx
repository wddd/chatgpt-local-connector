import { useSensitiveText } from "../Sensitive";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type CSSProperties,
  type Ref,
} from "react";
import {
  Dialog as D,
} from "radix-ui";
import {
  X,
  Check,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button as ShadcnButton } from "./button";
import { Switch as ShadcnSwitch } from "./switch";
import { Empty as EmptyRoot } from "./empty";
import { Spinner } from "./spinner";
import { Badge } from "./badge";
import { Alert } from "./alert";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./select";
import { Tooltip as TooltipRoot, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./dropdown-menu";
import { Dialog as DialogRoot, DialogTrigger, DialogContent, DialogTitle, DialogClose as CloseDialog } from "./dialog";
import { Slider as ShadcnSlider } from "./slider";
import { Checkbox as ShadcnCheckbox } from "./checkbox";
import { Progress as ShadcnProgress } from "./progress";
import { Label } from "./label";
export { Input } from "./input";
export { Textarea } from "./textarea";
import { t } from "../../i18n";
import { HoverScope } from "./HoverScope";
export { HoverScope };
export { HoverPreviewGroup } from "./HoverPreviewGroup";
export { LoadingIndicator } from "./Feedback";
export { DataTable, Pagination } from "./DataTable";
export function Tag({ children, title, tone }: { children: ReactNode; title?: string; tone?: "source" | "agent" }) {
  return <Badge variant="secondary" className={cn("task-tag rounded-sm border-0 px-1.5 py-0.5 text-xs font-normal", tone === "source" && "bg-role-source-soft text-role-source", tone === "agent" && "bg-role-agent-soft text-role-agent")} title={title} data-tone={tone}>{children}</Badge>;
}
export function Icon({
  icon: Component,
  size = 16,
  className = "",
}: {
  icon: LucideIcon;
  size?: 16 | 20;
  className?: string;
}) {
  return (
    <Component
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      className={cn("icon", size === 20 ? "size-5" : "size-4", className)}
    />
  );
}
export function Button({
  variant = "secondary",
  busy = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "link" | "danger" | "danger-outline" | "surface";
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <ShadcnButton
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || props["aria-busy"]}
      variant={variant}
      className={cn(variant === "surface" ? "surface-button" : `button ${variant}`, className)}
    >
      {busy && <Icon icon={LoaderCircle} className="spin" />}
      {children}
    </ShadcnButton>
  );
}
export function IconButton({
  icon,
  label,
  busy = false,
  size = 16,
  className = "",
  ...props
}: Omit<Parameters<typeof Button>[0], "children" | "title"> & {
  icon: LucideIcon;
  label: string;
  size?: 16 | 20;
}) {
  return (
    <Button
      variant="ghost"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      aria-label={label}
      className={cn("icon-button size-7 min-h-7 min-w-7 shrink-0 p-1.25", className)}
    >
      <Icon icon={busy ? LoaderCircle : icon} size={size} className={busy ? "spin" : ""} />
    </Button>
  );
}
export function Slider({ label, value, min, max, step, onChange, onCommit }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (value: number) => void; onCommit: (value: number) => void;
}) {
  return <ShadcnSlider className="min-h-9" aria-label={label} value={[value]} min={min} max={max} step={step}
    onValueChange={values => onChange(values[0])} onValueCommit={values => onCommit(values[0])} onBlur={() => onCommit(value)} thumbLabel={label} />;
}
export function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id?: string;
  label: ReactNode;
  error?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field grid min-w-0 gap-2">
      <div className="field-heading flex items-center justify-between gap-3 text-sm font-medium">
        <Label htmlFor={id}>{label}</Label>
        {help}
      </div>
      {children}
      {error && (
        <p
          id={id ? `${id}-error` : undefined}
          className="field-error text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
export function Notice({
  children,
  tone = "danger",
  action,
}: {
  children: ReactNode;
  tone?: "danger" | "warning" | "success";
  action?: ReactNode;
}) {
  const protect = useSensitiveText();
  return (
    <Alert
      className={cn("notice flex items-center justify-between gap-3 whitespace-pre-wrap break-words rounded-lg border-0 px-4 py-3 text-sm", tone === "danger" ? "bg-danger-soft text-destructive" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-success-soft text-success")}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span>{typeof children === "string" ? protect(children) : children}</span>
      {action}
    </Alert>
  );
}
export function Empty({
  children,
  action,
  icon,
}: {
  children: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <EmptyRoot className="empty grid justify-items-center gap-4 px-4 py-8 text-center text-muted-foreground md:p-8" role="status">
      {icon && <Icon icon={icon} size={20} />}
      <p>{children}</p>
      {action}
    </EmptyRoot>
  );
}
export function Loading({ label = t("loading") }: { label?: string }) {
  return (
    <div className="loading flex items-center justify-center gap-2 p-6 text-muted-foreground" role="status">
      <Spinner aria-hidden="true" />
      {label}
    </div>
  );
}
export const toneClasses = { neutral: "text-muted-foreground", accent: "text-brand-accent", success: "text-success", warning: "text-warning", danger: "text-destructive" };
export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  return (
    <span className={cn("status inline-flex items-center gap-1.5 whitespace-nowrap text-xs", toneClasses[tone])}>
      <span aria-hidden="true" className="status-dot size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <ShadcnSwitch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
      className="switch"
    />
  );
}
export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean | "indeterminate";
  onChange: (value: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return <Label className="flex min-h-7 min-w-0 cursor-pointer items-start gap-2 py-1 text-sm" htmlFor={id}>
    <ShadcnCheckbox id={id} checked={checked} onCheckedChange={value => onChange(value === true)} disabled={disabled} />
    <span className="break-words">{children}</span>
  </Label>;
}

export type Choice = {
  value: string;
  label: string;
  icon?: LucideIcon;
  graphic?: ReactNode;
  content?: ReactNode;
  color?: string;
  description?: string;
  warning?: string;
  disabled?: boolean;
};
export function SingleChoice({
  value,
  onChange,
  options,
  label,
  disabled,
  swatches = false,
  compact = false,
  cards = false,
  navigation = false,
  tiles = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly Choice[];
  label: string;
  disabled?: boolean;
  swatches?: boolean;
  compact?: boolean;
  cards?: boolean;
  navigation?: boolean;
  tiles?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(false);
  const [contentWidth, setContentWidth] = useState<number>();
  useLayoutEffect(() => {
    const check = () => {
      setContentWidth(measure.current?.scrollWidth);
      setFits(
        !!container.current &&
          !!measure.current &&
          measure.current.scrollWidth <= container.current.clientWidth,
      );
    };
    check();
    const observer = new ResizeObserver(check);
    if (container.current) observer.observe(container.current);
    if (measure.current) observer.observe(measure.current);
    return () => observer.disconnect();
  }, [options]);
  const pills = options.length <= 5 && fits;
  const optionContent = (option: Choice) => option.content ?? <>{option.graphic}{option.icon && <Icon icon={option.icon} />}<span className="min-w-0">{option.label}{(cards || navigation) && <>{option.description && <small className="mt-1 block text-xs font-normal text-muted-foreground">{option.description}</small>}{option.warning && <small className="block text-xs text-warning">{option.warning}</small>}</>}</span></>;
  const itemClass = cn("min-h-7.5 h-auto gap-2 rounded-sm px-3 py-1 text-sm font-normal text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm",
    (cards || navigation) && "justify-start whitespace-normal text-start",
    cards && "min-h-20 border border-border p-4 data-[state=on]:border-primary",
    navigation && "p-3 data-[state=on]:bg-secondary",
    tiles && "flex-col p-3",
    swatches && "size-6.5 min-h-6.5 rounded-full p-1 text-white data-[state=on]:bg-transparent");
  const groupClass = cn("w-max max-w-full gap-0.5 rounded-md bg-secondary p-0.75", (cards || navigation) && "grid w-full grid-cols-1 gap-2.5 bg-transparent p-0", swatches && "gap-2.5 bg-transparent p-1");
  const items = options.map(option => <ToggleGroupItem key={option.value} value={option.value} disabled={option.disabled} aria-label={option.label} title={option.disabled ? option.description : undefined} className={itemClass}
    data-hover-target={navigation ? option.value : undefined} style={swatches && option.color ? { background: option.color } as CSSProperties : undefined}>
    {swatches ? <Icon icon={Check} className={option.value === value ? "opacity-100" : "opacity-0"} /> : optionContent(option)}
  </ToggleGroupItem>);
  return <div ref={container} style={compact && contentWidth ? { width: contentWidth } : undefined} className="choice relative w-full min-w-0 max-w-full">
    {/* Measure the same content and variants as the visible pills, including object rows. */}
    {options.length <= 5 && <div className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden" aria-hidden="true" inert>
      <ToggleGroup ref={measure} type="single" value={value} disabled={disabled} rovingFocus={false} className={cn(groupClass, "w-max max-w-none")}>{items}</ToggleGroup>
    </div>}
    {pills ? <ToggleGroup type="single" value={value} onValueChange={next => { if (next) onChange(next); }} disabled={disabled} aria-label={label}
      className={groupClass}>{items}
    </ToggleGroup> : <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label}><SelectValue>{options.find(option => option.value === value)?.label}</SelectValue></SelectTrigger>
      <SelectContent position="popper" sideOffset={6} collisionPadding={12}><HoverScope tracking="highlighted">
        {options.map(option => <SelectItem key={option.value} value={option.value} textValue={option.label} aria-label={option.label} aria-labelledby={undefined} disabled={option.disabled} data-hover-target={option.value}>{optionContent(option)}</SelectItem>)}
      </HoverScope></SelectContent>
    </Select>}
  </div>;
}

export function DetailDialog({ trigger, title, children }: { trigger: ReactNode; title: ReactNode; children: ReactNode }) {
  return <DialogRoot><DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent showCloseButton={false} aria-describedby={undefined} className="detail-dialog flex max-h-dvh flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <header className="flex items-center justify-between gap-4 border-b px-5 py-4"><DialogTitle>{title}</DialogTitle><CloseDialog asChild><IconButton icon={X} label={t("close")} /></CloseDialog></header>
      <div className="overflow-auto p-5">{children}</div>
    </DialogContent></DialogRoot>;
}
export const DialogClose = D.Close;
export { default as Dialog } from "../ElasticPanel";
export function Tooltip({
  text,
  children,
  side = "top",
  hoverOnly = false,
}: {
  text: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  hoverOnly?: boolean;
}) {
  const protect = useSensitiveText();
  const [open, setOpen] = useState(false);
  const pointerHover = useRef(false);
  const dismiss = () => {
    pointerHover.current = false;
    setOpen(false);
  };
  return (
    <TooltipRoot
      open={hoverOnly ? open : undefined}
      onOpenChange={hoverOnly ? (next) => setOpen(next && pointerHover.current) : undefined}
      disableHoverableContent={hoverOnly}
    >
      <TooltipTrigger
        asChild
        onFocus={hoverOnly ? (event) => event.preventDefault() : undefined}
        onPointerMoveCapture={hoverOnly ? (event) => {
          // A restored focus or a surface disappearing under a stationary
          // pointer is not a new hover. Require actual mouse movement.
          if (event.pointerType === "mouse" && event.buttons === 0 &&
              (event.movementX !== 0 || event.movementY !== 0))
            pointerHover.current = true;
        } : undefined}
        onPointerLeave={hoverOnly ? dismiss : undefined}
        onPointerDownCapture={hoverOnly ? dismiss : undefined}
        onClickCapture={hoverOnly ? dismiss : undefined}
        onBlur={hoverOnly ? dismiss : undefined}
      >{children}</TooltipTrigger>
        <TooltipContent className="tooltip max-w-75 rounded-lg border px-2.5 py-1.5 text-xs shadow-overlay" side={side} sideOffset={6} collisionPadding={10}>
          {typeof text === "string" ? protect(text) : text}
        </TooltipContent>
    </TooltipRoot>
  );
}
export { TooltipProvider };
export function Menu({
  trigger,
  items,
  label,
}: {
  trigger: ReactNode;
  label: string;
  items: {
    label: string;
    action: () => void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          className="menu"
          aria-label={label}
          sideOffset={6}
          collisionPadding={12}
        >
          <HoverScope tracking="highlighted">
          {items.map((item, index) => (
            <DropdownMenuItem
              key={index}
              data-hover-target={item.danger ? undefined : String(index)}
              className={cn("menu-item", item.danger && "text-destructive")}
              disabled={item.disabled}
              onSelect={item.action}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
          </HoverScope>
        </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Progress({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return <ShadcnProgress className="progress h-1.5 bg-border" value={Math.max(0, Math.min(100, value))} aria-label={label} indicatorColor={color} />;
}


export { PlatformIcon } from "./PlatformIcon";
export { StateBadge, SectionHeader, EntityRow, EntityCard, FactList, Freshness, AddressField } from "./Shells";

export { SettingsSection, SettingRow, FormField, FormSection, ActionGroup, Disclosure, DangerZone, ChoiceControl } from "./Forms";
export { ViewStack, MeterSegment } from './Layout';
