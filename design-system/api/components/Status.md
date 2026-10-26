# Arc.Status

The existing semantic dot and label.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `children` | `string` | `required` | Status label. |
| `tone` | `"neutral" &#124; "success" &#124; "warning" &#124; "danger"` | `"neutral"` | Semantic tone; no domain inference. |

## States

Neutral, success, warning and danger.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.Status" tone="success">${Arc.fixtures.labels.status}</x-import>`
```
