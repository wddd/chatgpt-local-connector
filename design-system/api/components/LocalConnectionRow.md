# Arc.LocalConnectionRow

State-only Local connection row. Requires [Arc.Root](Root.md).

| Prop | Type | Meaning |
| --- | --- | --- |
| `ingresses` | readonly Ingress[] | Current ingress snapshot; only local transports contribute. Missing means unknown; an empty local set means disabled. |

For multiple local clients, error takes precedence over connecting, connected, disconnected and disabled. There are no addresses or actions.
