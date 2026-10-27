# Arc.InteractionRequestCard

Real interaction request object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `interaction` | `AgentInteraction; required` | Recorded permission or question; response capability comes from this record. |
| `submission` | `ApprovalSubmission` | Submitting, pending, submitted, unconfirmed or failed response state. Terminal receipts prevent resubmission. |
| `answers / onAnswersChange` | `Record<string, string[]> / callback; required` | Controlled answers keyed by question ID. Secret answers use masked inputs. |
| `onRespond` | `(decision, payload) => void; required` | Owner receives the existing approval decision and payload. The mount does not send it. |
| `pager / focusKey / onClose / inline` | `RequestCard frame props` | Request navigation, body focus and inline presentation. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
