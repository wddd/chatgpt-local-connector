# Arc.RequestCard

Real request composite adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `title / children / context / leading / state / footer` | `string` | Plain-text title, body, context, icon stand-in, status and response slots. |
| `busy / disabled / inline / error` | `boolean / boolean / boolean / string` | Response availability, inline frame and retained error. |
| `pager` | `{ index: number; count: number; onChange: (index: number) => void }` | Zero-based navigation supplied by the owner. |
| `onSubmit / formId / focusKey / onClose` | `callback / string / string / callback` | Optional native form, body focus key and close action. Overlay focus and Escape belong to the host dialog. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
