# Arc.TaskRow

Real TASK adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Identity privacy follows Root; task content retains its existing sensitivity rules. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `kind` | `activity \| receipt \| dispatch; required` | Select the existing record projection. |
| `agent / session / live / now / index` | `string / TrackedActivity / boolean / number / number` | Activity props; agent, session, live and now are required for activity. |
| `record / runtime / records / id` | `TaskRecord / TaskRuntime / readonly TaskRecord[] / string` | Receipt requires record, records and id. Dispatch requires record; its optional live prop is an AgentActivitySession. |
| `onOpen / selected / disabled / actions` | `callback / boolean / boolean / string` | Receipt and dispatch require onOpen; dispatch receives the projected activity. Missing dispatch destinations disable navigation. Actions are text only in design islands. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.tasks`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.tasks.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
