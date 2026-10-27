# Arc.SrcAccountRow

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `source` | ControlSource; required | Source identity and pending-switch/state projection. |
| `account / ingress` | ProviderAccount / Ingress | Optional resolved identity and connection. |
| `onOpen / onConnection` | () => void / (id: string) => void | Separate source and connection actions. A connection Chip appears only with a valid callback. |
| `selected / attention / disabled` | boolean | Independent presentation states. |
| `actions` | string | Plain-text trailing slot in design islands. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.
