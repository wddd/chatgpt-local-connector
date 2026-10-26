# Arc.FormField

Label, control, help and error in consistent vertical order.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | `string` | optional | Associates a direct application control with its label, help and error. |
| `label` | `string` | required | Field label. |
| `help` | `string` | optional | Constraint/help below the control. |
| `error` | `string` | optional | Validation error, announced as an alert. |
| `children` | `string` | required | Plain-text control stand-in in a design island. |

## States

Error and help remain associated through descriptive IDs. The application owner validates and focuses the first invalid control. Text-only design mounts use a labelled group rather than pretending the text is an input.

## Canvas example

```html
<x-import component-from-global-scope="Arc.FormField" label="Label" help="Maximum 120 bytes.">Example source</x-import>
```
