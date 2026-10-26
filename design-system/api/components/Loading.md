# Arc.Loading

The existing spinner and localized loading label.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `label` | `string` | `localized loading message` | Override the loading label. |

## States

Loading with default locale label or explicit text. Exposes role=status.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  label: Arc.fixtures.labels.loading,
};
```

```html
<x-import component-from-global-scope="Arc.Loading" label="{{label}}"></x-import>
```
