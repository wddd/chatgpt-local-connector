# Arc.SrcAccountCard

Real SRC/TUNNEL object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `source / account / product` | ControlSource / ProviderAccount / string | Optional selected source and account; product brands an account without a selected source. |
| `ingress / authorization` | Ingress / OAuthRequest | Connection reference and current authorization request only; no grant history. |
| `onConnection / onAuthorization` | callbacks | Explicit targets; missing targets remain text. |
| `headerActions / children / footer / danger` | string | Plain-text slots in design islands. Real host controls stay inside the product React runtime. |
| `loading / error` | boolean / string | Retained identity/facts and explicit read error. Raw identity evidence is omitted. |

## Mounting

Pass typed synthetic records from `Arc.fixtures` and stub callbacks through named `renderVals` holes. Use `Arc.fixtures.tunnelFrames` for TunnelNode. Missing optional facts are omitted or shown as unknown; historical references never acquire live state. Native editing, navigation and approval belong to the embedding host.
