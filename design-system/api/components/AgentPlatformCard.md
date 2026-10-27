# Arc.AgentPlatformCard

Real AGENT adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `agent / frame / quota` | `Agent / catalog \| detail \| panel / ProviderAccount["quota"] \| null` | Required inventory record; detail is the default frame. Reuses existing quota rings. |
| `onOpen / onLink` | `callbacks` | Host-owned detail navigation and official setup link. |
| `headerActions / titleActions / secondary / children` | `string` | Plain-text slots. The host supplies real settings, accounts and tasks. |
| `loading / error` | `boolean / string` | Retain inventory evidence while loading or reporting a read error. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.agentObjects`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.
