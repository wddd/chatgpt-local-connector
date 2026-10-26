# Arc.IconButton

The existing shared IconButton, resolving the icon inside React 19.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `icon` | `"RefreshCw" &#124; "Plus" &#124; "Check" &#124; "X" &#124; "Info"` | `required` | Named Lucide icon. |
| `label` | `string` | `required` | Accessible button name. |
| `size` | `16 &#124; 20` | `16` | Icon size. |
| `busy` | `boolean` | `false` | Spinner; disables the action. |
| `disabled` | `boolean` | `false` | Disables the action. |
| `variant` | `Button variant union` | `"ghost"` | Same allowed values as Button. |
| `HTML button props` | `Omit<Button props, "children" &#124; "title" &#124; "ref">` | `optional` | Includes onClick, className, style and aria-*; no React element props. |

## States

Default, focus, busy and disabled. Invalid icon names are rejected.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.IconButton" icon="RefreshCw"
  label=${Arc.fixtures.labels.button} on-click=${() => {}}></x-import>`
```
