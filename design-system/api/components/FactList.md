# Arc.FactList

Definition list with an explicit policy for absent values.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `items` | `readonly { label: string; value?: string &#124; null; key?: string }[]` | `required` | Plain-text fact records; key is an optional stable identity. |
| `missing` | `{ omit: true } &#124; { placeholder: string }` | `required` | Omit absent values or show the plain-text placeholder. |
| `className` | `string` | `empty` | Additional list class name. |

## States

Present values, omitted missing facts or placeholder facts. undefined, null and the empty string are absent; use strings for numeric values.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  items: [{ label: "Agent", value: "Claude" }, { label: "Plan" }],
  missing: { placeholder: "Unknown" },
};
```

```html
<x-import component-from-global-scope="Arc.FactList" items="{{items}}" missing="{{missing}}"></x-import>
```
