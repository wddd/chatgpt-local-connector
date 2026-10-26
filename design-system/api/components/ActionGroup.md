# Arc.ActionGroup

Button layout with standard spacing, wrapping and explicit alignment.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `align` | `leading | trailing` | trailing | Horizontal alignment. |
| `children` | `string` | required | Plain-text action stand-in in a design island. |

## States

Application callers supply real buttons. The group wraps at narrow widths and does not own disabled or busy state. Design islands cannot accept nested host buttons.

## Canvas example

```html
<x-import component-from-global-scope="Arc.ActionGroup" align="trailing">Save actions</x-import>
```
