# Arc.DeploymentProgressCard

Real deployment progress object adapter. Requires [Arc.Root](Root.md). Records use existing UI types; no stores, live reads or mutations are created by the mount. Privacy follows Root. All design-island content slots accept plain text only.

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `progress` | `RelayProgress; required` | Login, deploying, connecting, ready or failed evidence, optional account choices and result URL. |
| `account / setAccount / busy` | `string / callback / boolean; required` | Controlled account selection and pending action state. |
| `onCancel / onRetry` | `callbacks; required` | Host-owned cancellation and retry. The mount does not deploy or change a Relay. |

## Mounting

Pass typed synthetic records from [Arc.fixtures](fixtures.md) (`Arc.fixtures.requests`) and stub callbacks through named `renderVals` holes. Copy records before changing states. The preview runs in light and dark through Root. Native navigation, decisions and lifecycle belong to the embedding host.

Use `Arc.fixtures.requests.now` for Root and any explicit `now` prop to keep recorded timestamps aligned.
