# Arc.TunnelRow

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `ingress / sources` | Ingress / readonly ControlSource[]; required | Connection and carried-source count from supplied collection. |
| `onOpen / selected / disabled / attention` | callback / boolean | Optional navigation and independent states. Selection flows wrap a static Row in SingleChoice. |
| `constraint / actions` | string | Eligibility reason overrides the address line; plain-text independent actions slot. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.
