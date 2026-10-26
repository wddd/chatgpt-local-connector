# Arc.QuotaBubble

The existing full quota composite, including all windows, error notices, product usage and credit disclosures.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `provider` | `ProviderSnapshot` | `required` | See fixtures for the shared quota schema. |
| `onRefresh` | `() => Promise<void>` | `optional` | Omitted callback emits arc:action with kind=refreshSubscription. |
| `link` | `boolean` | `true` | Show the provider usage link when the existing resolver supports it. Activation emits arc:action with kind=openUrl. |

See [fixture types](fixtures.md) and the current application types for full record fields.

## States

Ready, refreshing, stale, unavailable, blocked, exhausted, empty, unknown reset and expired reset credit. Hover/focus opens existing detail popovers. Refresh failure shows retained data and error text. Root.privacy masks sensitive error text.

## Canvas example

```js
html`<x-import component-from-global-scope="Arc.QuotaBubble"
  provider=${Arc.fixtures.quotaStates.stale} on-refresh=${async () => {}}
  link=${false}></x-import>`
```
