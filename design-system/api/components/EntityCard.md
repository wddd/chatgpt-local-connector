# Arc.EntityCard

Entity surface using the shared SectionHeader and plain-text content slots.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `icon / title / headerActions / footer / danger / children` | `string` | `optional` | Plain-text slots. icon is text, not a Lucide icon name. |
| `variant` | `"surface" &#124; "outline"` | `"surface"` | Filled card or an outline with no added fill for grouped facts. |
| `level` | `1 &#124; 2 &#124; 3 &#124; 4` | `3` | Header heading level. |
| `asChild` | `false` | `false` | Radix element composition is unavailable across React versions. |
| `className / HTML attributes` | `standard section attributes and callbacks` | `optional` | Pass through to the section; no refs or HTML injection. |

## States

With or without title, header actions, footer and danger content. asChild composition is excluded; other card states use the application renderer.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  level: 3,
  content: "Provider details",
};
```

```html
<x-import component-from-global-scope="Arc.EntityCard" icon="C" title="Claude" level="{{level}}" header-actions="Refresh" footer="Observed now" danger="Unavailable">{{content}}</x-import>
```
