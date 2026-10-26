# Arc.SourceIcon

The current SourceIcon renderer, serving the first batch's platform-icon role. Uses the existing source registry and retained brand assets.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `platform` | `string` | `required` | Control-source product ID such as claude or chatgpt, or a known asset key. Unknown keys use Plug. |
| `add` | `boolean` | `false` | Show Plus instead of the brand. |
| `panelVisual` | `boolean` | `false` | Existing panel-visual marker. |

## States

Known SVG/image brand, unknown fallback and add. The icon is decorative (aria-hidden); give its owning action an accessible name.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.SourceIcon"
  platform=${Arc.fixtures.sources[0].product}></x-import>`
```
