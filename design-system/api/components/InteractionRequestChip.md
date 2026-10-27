# Arc.InteractionRequestChip

Real interaction request object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `interaction / submission` | `AgentInteraction / ApprovalSubmission` | Required request and optional response receipt. |
| `onOpen / disabled / count` | `callback / boolean / number` | Optional navigation, disabled action and request-count presentation. Without onOpen this is a static tag. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
