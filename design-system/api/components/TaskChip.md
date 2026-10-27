# Arc.TaskChip

Real TASK adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Identity privacy follows Root; task content retains its existing sensitivity rules. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `task` | `TaskReference; required` | Discriminated activity (session, live), conversation (conversation), or receipt (record, optional runtime/live/records) reference. |
| `onOpen / selected / disabled` | `callback / boolean / boolean` | Optional host navigation and reference states. No target leaves a static reference. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.tasks`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.tasks.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
