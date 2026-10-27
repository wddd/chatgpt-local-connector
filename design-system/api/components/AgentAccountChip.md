# Arc.AgentAccountChip

Real AGENT adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `account / agent` | `ProviderAccount / string; required` | Account identity and selected Agent; only matching profile states are shown. |
| `onOpen / selected / disabled` | `callback / boolean / boolean` | Removed accounts are disabled. Accounts without matching profiles remain static. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.agentObjects`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.
