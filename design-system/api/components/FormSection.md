# Arc.FormSection

Field grouping inside the existing native form; never creates another form.

Requires [Arc.Root](Root.md). All slots and children accept plain text only across React versions. Use template holes for non-string props.

## Props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | optional | Fieldset legend. |
| `description` | `string` | optional | Group constraint. |
| `children` | `string` | required | Plain-text field stand-in. |

## States

One column, semantic fieldset/legend, shared vertical rhythm.

## Canvas example

```html
<x-import component-from-global-scope="Arc.FormSection" title="Connection">Connection fields</x-import>
```
