# Arc.AgentPlatformChip

Real AGENT adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `agent / state` | `Agent / string` | Required inventory record and optional state override; otherwise derives installed, available and enabled state. |
| `onOpen / selected / disabled` | `callback / boolean / boolean` | Optional host navigation and reference states. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.agentObjects`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.
