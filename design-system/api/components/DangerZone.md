# Arc.DangerZone

End-of-panel destructive actions with a concise consequence.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `consequence` | `string` | required | One-sentence consequence; may wrap at narrow widths. |
| `children` | `string` | required | Plain-text destructive-action stand-in. |

## States

The application supplies danger buttons and owns confirmation, busy state and errors. The component never executes actions by itself.

## Canvas example

```html
<x-import component-from-global-scope="Arc.DangerZone" consequence="This source will lose access.">Disconnect</x-import>
```
