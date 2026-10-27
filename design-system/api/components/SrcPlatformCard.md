# Arc.SrcPlatformCard

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `product` | string; required | Registry product identity. |
| `sources / accounts / ingresses` | ControlSource[] / ProviderAccount[] / Ingress[]; required | Existing associations; account count is derived, never stored. |
| `onSource / onConnection / onAdd / onLink` | callbacks | Explicit source, connection, add and external-link targets. |
| `headerActions` | string | Plain-text slot in design islands. |
| `loading / error` | boolean / string | Retain supplied records during loading or read failure. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.
