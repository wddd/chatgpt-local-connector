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
export const Select = { ...Radix.Select, Portal: SelectPortal };
export const Popover = { ...Radix.Popover, Portal: PopoverPortal };
