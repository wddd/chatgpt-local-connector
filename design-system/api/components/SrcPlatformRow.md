# Arc.SrcPlatformRow

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `product` | string; required | Product identity and artwork. |
| `label / compact / constraint` | string / boolean / string | Explicit flow label, short-name preference and eligibility reason. |
| `onOpen / selected / disabled` | callback / boolean | Optional browse action and presentation. Selection flows wrap a static Row in SingleChoice. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.
