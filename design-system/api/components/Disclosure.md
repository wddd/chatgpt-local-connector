# Arc.Disclosure

Radix collapsible with an accessible button and chevron.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | required | Toggle name. |
| `children` | `string` | required | Plain-text content. |
| `open` | `boolean` | optional | Controlled expanded state. |
| `defaultOpen` | `boolean` | false | Initial uncontrolled state. |
| `onOpenChange` | `(open: boolean) => void` | optional | Expanded-state callback. |
| `disabled` | `boolean` | false | Disables the toggle. |

## States

Enter/Space toggles. aria-expanded and aria-controls follow the content; collapsed controls leave the tab sequence. Focus remains on the trigger. Reduced motion suppresses chevron motion.

## Canvas example

```html
<x-import component-from-global-scope="Arc.Disclosure" title="Advanced">Additional connection settings</x-import>
```
