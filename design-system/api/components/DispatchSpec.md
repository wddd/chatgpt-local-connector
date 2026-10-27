# Arc.DispatchSpec

One read-only chip for a recorded task/turn spec. No dispatch configuration is changed. Requires [Arc.Root](Root.md).

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `agent` | string, required | Dispatch owner; never infer the owner from the model ID. |
| `record` | DispatchSpecRecord, required | Session, timeline or task record described below. |
| `resolver` | CatalogState, optional | Native-shaped label snapshot for deterministic mounts. Design defaults use synthetic catalogs only. |
| `variant` | `"panel"` (default) or `"inline"` | Panel chip or unfilled compact text inheriting the bubble secondary text size. |

`DispatchSpecRecord` is one of:

- `{ kind: 'session', value: { id, source, dispatchSummary? } }`, using AgentActivitySession or AgentConversation fields.
- `{ kind: 'timeline', taskId, turnId?, source?, value: { dispatchSummary?, turnDispatchSummaries? } }`. An explicit turn reads only its own summary. Missing old turns never inherit the current summary. source=transcript reads the Agent catalog without treating the external transcript identity as an ARC task.
- `{ kind: 'task', value: { agent?, taskId?, threadId?, requestId, task } }`, using TaskRecord fields. Reads task.model, task.effort and the recorded task.dispatch.serviceTier when present; task.settings is not a tier contract.

`CatalogState` is `{ status: 'ready' | 'loading' | 'error', catalog?: DispatchCatalog }`. The catalog uses native `models: [{ model, name?, displayName?, provider?: { id, name }, contextWindow?, group?, options? }]` and `authoritative` completeness flag and optional `source`, `options`, `currentModel`, `optionsForModel`, `unavailable`. Each option has `id`, optional `category`, and `values: [{ value, name? } | string]`. A missing-model response can supply `models: { unavailable }`.

## Labels and states

Labels use `displayName` unchanged. Add `provider.name` only when it disambiguates equal native names. IDs match by exact string equality. When no displayName is supplied, display the complete opaque ID unchanged, including during loading or failure. Never decode JSON IDs, strip brands or split labels. Refreshes retain resolved metadata. Only absence from an authoritative catalog marks a selection Unresolved; snapshots and partial lists cannot establish that. Missing specs show Spec not recorded.

Recorded efforts use matching model/session native labels when available, otherwise localized effort vocabulary. Only `priority` renders Fast. Default and absent tiers are omitted. Separators join present fields only. An empty inline spec is hidden. Narrow chips ellipsize the model label without rewriting it. Hover, keyboard focus and accessible names expose the complete label.

## Canvas example

```js
const spec = Arc.fixtures.dispatchSpecs[1];
const renderVals = { record: spec.record, resolver: spec.resolver };
```

```html
<x-import component-from-global-scope="Arc.DispatchSpec" agent="dsh" record="{{record}}" resolver="{{resolver}}"></x-import>
```

`Arc.fixtures.dispatchSpecs` includes dsh, Codex, missing/older turns, absent tier, unknown model, loading, catalog failure, and Claude Code without a model in panel and inline variants. No backend calls occur in design mounts.
