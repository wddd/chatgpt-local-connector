# Arc.SrcPlatformChip

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `product` | string; required | Registry product ID, distinct from vendor ID. |
| `sources` | readonly ControlSource[] | Only supplied live sources contribute state; mixed states are unknown. |
| `compact` | boolean | Use the registry short name. |
| `onOpen` | () => void | Only known products get navigation. |
| `selected / attention / disabled / label` | boolean / string | Independent presentation states and optional accessible label. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.
