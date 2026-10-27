# Arc.AuthorizationRequestCard

Real authorization request object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `request / ingress` | `OAuthRequest / Ingress; required` | Authorization status, pairing code, expiration and connection tool policy. |
| `sourceId / onSourceChange / candidates` | `string / callback / ControlSource[]; required` | Controlled source choice; new or an existing candidate. |
| `label / onLabelChange / profile / onProfileChange` | `string / callback / RemoteProfile / callback; required` | Controlled new-source name and remote profile. |
| `fixed / oldConnection / remaining` | `ControlSource / Ingress / ControlSource[]` | Switch target, old connection and required remaining-source list. |
| `onDecide / busy / error / labelError` | `callback / boolean / string / string` | Owner receives the allow decision; pending actions and validation remain explicit. |
| `inline / pager` | `boolean / RequestCard pager` | Inline frame and owner-controlled request navigation. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
