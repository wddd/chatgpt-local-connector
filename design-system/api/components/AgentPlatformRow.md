# Arc.AgentPlatformRow

Real AGENT adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `agent` | `Agent; required` | Inventory version, installation, enabled state and discovery error. |
| `onOpen / selected / disabled / actions` | `callback / boolean / boolean / string` | Host navigation, selection, disabled state and plain-text action slot. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.agentObjects`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.
