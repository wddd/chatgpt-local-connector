# Arc.SrcConversationRow

One conversation in an SRC account's conversation list. Requires [Arc.Root](Root.md).

| Prop | Type | Meaning |
| --- | --- | --- |
| `conversation` | SrcConversation; required | Title, kind, last activity and linked ARC tasks. |
| `onTask` | (task) => void; required | Opens a linked task's detail on the AGENT side. |

Raw session or task IDs are never shown as titles; untitled conversations show their kind and time. One linked task makes the row open it. Several linked tasks render a disclosure with one row per task.
