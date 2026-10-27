# Arc.ObjectMenu

Composes DropdownMenu and an anchored Popover. An item with a consequence requires confirmation. Pending confirmation prevents duplicate submissions and dismissal. Escape closes only the current layer; closing restores trigger focus.

## Props

`label: string`, `items: { label, onSelect, consequence?, disabled? }[]`, optional `revealed`.

## Mounts

Exported through `ui/design-mount.ts`. Secondary icons also reveal on focus-within and coarse pointers. Icon controls expose a name and tooltip.
