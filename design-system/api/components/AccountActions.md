# Arc.AccountActions

Rename and remove actions for one SRC or AGENT account. Requires [Arc.Root](Root.md).

| Prop | Type | Meaning |
| --- | --- | --- |
| `alias` | string; required | Current account name, prefilled in the rename field and shown in the remove title. |
| `onRename` | (alias: string) => Promise<void>; required | Saves a trimmed nonempty name. |
| `onRemove` | () => Promise<void>; required | Removes the account. |

Each action opens a centered Dialog with a native form. An empty name focuses the field with its error. A rejected promise keeps the dialog open and shows the error.
