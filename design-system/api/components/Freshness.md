# Arc.Freshness

Observation timestamp with caller-supplied age text and an optional refresh callback. The shell does not calculate age.

Requires [Arc.Root](Root.md). Non-string props use named `{{ }}` holes from `renderVals`. All children and slots accept plain text only.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `observedAt` | `string &#124; null` | `optional` | Parseable timestamp; otherwise render unknown. |
| `age` | `string` | `required` | Visible age for a valid timestamp; owner updates this text. |
| `unknown` | `string` | `"—"` | Text for absent or invalid timestamps. |
| `timestampLabel / label` | `string` | `optional` | Timestamp tooltip / accessible time label. |
| `stale / busy / disabled` | `boolean` | `false` | Stale marker and refresh action states. |
| `onRefresh` | `() => void` | `optional` | Render a refresh button and invoke the owner callback. |
| `refreshLabel` | `string` | `localized refresh` | Accessible refresh button label. |
| `className` | `string` | `empty` | Additional class name. |

## States

Valid, unknown, stale, refreshing and disabled. A refresh button appears only with onRefresh. Busy disables it; age and timestamp stay under owner control.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  observedAt: new Date(Arc.fixtures.now).toISOString(),
  stale: true,
  refresh: () => {},
};
```

```html
<x-import component-from-global-scope="Arc.Freshness" observed-at="{{observedAt}}" age="Just now" stale="{{stale}}" on-refresh="{{refresh}}" refresh-label="Refresh observation"></x-import>
```
