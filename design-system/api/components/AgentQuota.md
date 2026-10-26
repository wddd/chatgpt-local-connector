# Arc.AgentQuota

The existing compact quota panel. It selects the short and weekly windows, or up to two finite windows as fallback.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `provider` | `ProviderSnapshot` | `required` | See fixtures for the shared quota schema. |
| `onRefresh` | `() => void` | `required` | Explicit refresh callback; no implicit backend call. |
| `refreshing` | `boolean` | `required` | Combined with provider.refreshing for the busy refresh button. |

See [fixture types](fixtures.md) and the current application types for full record fields.

## States

Ready, refreshing, missing windows, stale data, blocked/exhausted windows, pace warnings, unknown reset time, credit balance and reset-credit disclosure. Uses Root.now and Root.locale.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  quota: Arc.fixtures.quotaSnapshots[0],
  refreshing: false,
  refresh: () => {},
};
```

```html
<x-import component-from-global-scope="Arc.AgentQuota" provider="{{quota}}" refreshing="{{refreshing}}" on-refresh="{{refresh}}"></x-import>
```
