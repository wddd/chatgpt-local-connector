# Arc.TaskCard

Real TASK adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Identity privacy follows Root; task content retains its existing sensitivity rules. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `agent / agentName / task` | `string / string / Detail; agent and task required` | Timeline detail uses session, optional fallbackSession/timeline/title/turnId/source/duration, and required running/hasPending. Receipt detail uses record, optional runtime and required records. |
| `children / titleId` | `string / string` | Plain-text detail body and optional heading ID. The host owns timeline content and response controls. |
| `onBack / onClose / onOpen / onToggleWidth` | `callbacks` | Explicit navigation and width actions. |
| `expanded / narrow / busy` | `boolean` | Width state, compact action menu and pending native-open state. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.tasks`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.tasks.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
