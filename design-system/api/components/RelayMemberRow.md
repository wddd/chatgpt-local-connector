# Arc.RelayMemberRow

Real Relay member object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `member / deviceName / now` | `Member / string / number` | Required member and fixed epoch milliseconds; optional local device name. Names follow Root privacy. |
| `onRemove / disabled` | `callback / boolean` | Removal request belongs to the host. The self member never shows removal. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
