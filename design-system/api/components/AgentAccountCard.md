# Arc.AgentAccountCard

Real AGENT adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `account / agent / frame` | `ProviderAccount / Agent / detail \| panel` | Required account, optional Agent filter and frame. Identity follows Root privacy. |
| `onReauth / showProfiles` | `callback / boolean` | Host-owned native login. Profiles are shown by default; busy or removed accounts disable actions. |
| `title / icon / headerActions / titleActions / secondary / children / footer / danger` | `string` | Plain-text slots. The host supplies quota and task composition inside the product runtime. |
| `loading / busy / error` | `boolean / boolean / string` | Retain identity and profiles while loading, changing a profile or reporting a read failure. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.agentObjects`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.
