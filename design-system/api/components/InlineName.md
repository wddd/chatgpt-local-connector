# Arc.InlineName

Edits a name in place. Enter or blur saves a trimmed, nonempty value. Escape cancels and restores pencil focus. Errors retain the editor. Account headers set `revealed`; row owners supply the hover/focus context.

## Props

`value: string`, `onSave(value): Promise<void>`, optional `label` and `revealed`.

## Mounts

Exported through `ui/design-mount.ts`. The `context-actions-light` and `context-actions-dark` browser fixtures force revealed actions. Secondary icons also reveal on focus-within and coarse pointers. Icon controls expose a name and tooltip.
