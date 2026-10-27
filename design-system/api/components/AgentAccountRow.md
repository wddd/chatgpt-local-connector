# Arc.AgentAccountRow

Real AGENT adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `account / agent` | `ProviderAccount / string` | Required account and optional Agent filter; identity follows Root privacy. |
| `sources / providers` | `ControlSource[] / ProviderSnapshot[]` | Supplied records resolve branding when no Agent filter is selected. Defaults to empty lists. |
| `onOpen / selected / disabled / actions` | `callback / boolean / boolean / string` | Host navigation, selection, disabled state and plain-text actions. Removed accounts are disabled. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.agentObjects`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.
