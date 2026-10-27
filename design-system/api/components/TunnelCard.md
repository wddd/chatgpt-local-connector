# Arc.TunnelCard

Public-link address and state. Requires [Arc.Root](Root.md). Privacy follows Root.

| Prop | Type | Meaning |
| --- | --- | --- |
| `ingress` | Ingress; required | Live connection state, address and error. |
| `title` | string | Optional public-link display name. |
| `headerActions` | string | Plain-text design slot; the product host supplies start/stop. |
| `busy / error` | boolean / string | Disable copy while busy and report read/action errors. |

The card owns no navigation, source list, provider editor or lifecycle mutation.
