import { createContext, useContext, type ComponentProps } from 'react';
import * as Radix from 'radix-ui';
export * from 'radix-ui';

// Keep floating content under its island's scoped styles and theme.
export const PortalHost = createContext<HTMLElement | null>(null);
function SelectPortal(props: ComponentProps<typeof Radix.Select.Portal>) {
  const container = useContext(PortalHost);
  return <Radix.Select.Portal {...props} container={container ?? undefined} />;
}
function PopoverPortal(props: ComponentProps<typeof Radix.Popover.Portal>) {
  const container = useContext(PortalHost);
  return <Radix.Popover.Portal {...props} container={container ?? undefined} />;
}
function TooltipPortal(props: ComponentProps<typeof Radix.Tooltip.Portal>) {
  const container = useContext(PortalHost);
  return <Radix.Tooltip.Portal {...props} container={container ?? undefined} />;
}
export const Select = { ...Radix.Select, Portal: SelectPortal };
export const Popover = { ...Radix.Popover, Portal: PopoverPortal };
export const Tooltip = { ...Radix.Tooltip, Portal: TooltipPortal };

function DialogPortal(props: ComponentProps<typeof Radix.Dialog.Portal>) {
  const container = useContext(PortalHost);
  return <Radix.Dialog.Portal {...props} container={container ?? undefined} />;
}
function AlertDialogPortal(props: ComponentProps<typeof Radix.AlertDialog.Portal>) {
  const container = useContext(PortalHost);
  return <Radix.AlertDialog.Portal {...props} container={container ?? undefined} />;
}
function DropdownMenuPortal(props: ComponentProps<typeof Radix.DropdownMenu.Portal>) {
  const container = useContext(PortalHost);
  return <Radix.DropdownMenu.Portal {...props} container={container ?? undefined} />;
}
export const Dialog = { ...Radix.Dialog, Portal: DialogPortal };
export const AlertDialog = { ...Radix.AlertDialog, Portal: AlertDialogPortal };
export const DropdownMenu = { ...Radix.DropdownMenu, Portal: DropdownMenuPortal };
