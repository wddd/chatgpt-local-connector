# Arc.TunnelCard

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `ingress / relay` | Ingress / Relay | Optional connection and associated Relay. Missing connection state stays unknown. |
| `sources` | readonly ControlSource[]; required | Count only supplied sources associated with this connection. |
| `headerActions / address / children / footer / danger` | string | Plain-text design slots. Product hosts own controls, source rows, lifecycle and confirmation. |
| `busy / error` | boolean / string | Disable copy while busy; retain facts and report read/action errors. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.

An omitted `address` uses the shared Address/AddressField adapter. Product hosts can supply their existing credential/address editor instead; `null` suppresses the duplicate address. Design islands accept a plain-text replacement.
