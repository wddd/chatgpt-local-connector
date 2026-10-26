# Arc.Empty

The existing empty collection state.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `children` | `string` | `required` | Empty-state message. |
| `icon` | `"RefreshCw" &#124; "Plus" &#124; "Check" &#124; "X" &#124; "Info"` | `optional` | Decorative Lucide icon. |
| `action` | `string` | `optional` | Plain text trailing slot only. |

## States

With/without icon and trailing text. Exposes role=status.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.Empty">${Arc.fixtures.labels.empty}</x-import>`
```
