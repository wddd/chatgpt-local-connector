# Arc.Button

The existing shared Button.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `children` | `string` | `required` | Plain text label. |
| `variant` | `"primary" &#124; "secondary" &#124; "ghost" &#124; "link" &#124; "danger" &#124; "danger-outline"` | `"secondary"` | Visual action variant. |
| `busy` | `boolean` | `false` | Shows spinner and disables the action. |
| `disabled` | `boolean` | `false` | Disables the action. |
| `onClick` | `(event: React.MouseEvent<HTMLButtonElement>) => void` | `optional` | Receives the island event. |
| `HTML button props` | `ButtonHTMLAttributes<HTMLButtonElement>` | `optional` | Includes type, title, id, className, style, aria-* and event handlers; excludes ref and dangerouslySetInnerHTML. |

## States

Default, hover, focus, pressed, busy and disabled. A busy action cannot be clicked.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.Button" variant="primary"
  on-click=${() => {}}>${Arc.fixtures.labels.button}</x-import>`
```
