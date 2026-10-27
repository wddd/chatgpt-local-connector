# Arc.AuthorizationRequestRow

Real authorization request object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `request / source` | `OAuthRequest / ControlSource` | Required request and optional source label; expiration is recorded upstream evidence. |
| `onOpen / selected / disabled` | `callback; required / boolean / boolean` | Explicit review target, selection and action availability. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
