# Arc.Tag

The existing task/source tag.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `children` | `string` | `required` | Tag label. |
| `title` | `string` | `optional` | Native tooltip. |
| `tone` | `"source" &#124; "agent"` | `optional` | Role color; omit for the neutral appearance. |

## States

Neutral, source and Agent.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.Tag" tone="source">${Arc.fixtures.labels.tag}</x-import>`
```
