# Arc.AgentQuotaIcon

The existing Agent logo with quota ring; preserves current window selection and expiry rules.

Requires [Arc.Root](Root.md). Non-string props use template holes.

## Props

| Prop | Type / allowed values | Default | Meaning |
| --- | --- | --- | --- |
| `agent` | `string` | `required` | Agent ID, for example claude, codex or dsh; unknown IDs use Bot. |
| `dual` | `boolean` | `false` | Weekly plus short-window rings. |
| `quota` | `ProviderAccount["quota"] &#124; null` | `undefined` | Explicit account quota. null forces logo-only; omitted uses this Root's synthetic platform snapshot. |

See [fixture types](fixtures.md) and the current application types for full record fields.

## States

Single ring, dual rings, logo only, unavailable, stale, exhausted and expired windows. Expired windows do not render rings. Numeric percentages remain visible in privacy mode.

## Canvas example

Values for the canvas `renderVals`:

```js
const renderVals = {
  dual: true,
  quota: Arc.fixtures.accounts[0].quota,
};
```

```html
<x-import component-from-global-scope="Arc.AgentQuotaIcon" agent="claude" dual="{{dual}}" quota="{{quota}}"></x-import>
```
