# Arc.CopyValue

Renders the value followed by a copy icon with transient success feedback and a readable error. Children replace the display only; copying always uses value. Use a masked display for sensitive values. Pass null children when the content is already rendered immediately beside the action. Design adapters emit clipboard actions instead of writing to the system clipboard.

## Props

`value: string`, optional `children`, `label`, `disabled`, `onCopy(value)`.

## Mounts

Exported through `ui/design-mount.ts`. The `context-actions-light` and `context-actions-dark` browser fixtures force revealed actions. Secondary icons also reveal on focus-within and coarse pointers. Icon controls expose a name and tooltip.
