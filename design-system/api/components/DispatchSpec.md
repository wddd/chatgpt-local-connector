# Arc.DispatchSpec

One read-only chip for a recorded task/turn spec. No dispatch configuration is changed. Requires [Arc.Root](Root.md).

## Props

| Prop | Type | Meaning |
| --- | --- | --- |
| `agent` | string, required | Dispatch owner; never infer the owner from the model ID. |
| `record` | DispatchSpecRecord, required | Session, timeline or task record described below. |
| `resolver` | CatalogState, optional | Native-shaped label snapshot for deterministic mounts. Design defaults use synthetic catalogs only. |

`DispatchSpecRecord` is one of:

- `{ kind: 'session', value: { id, source, dispatchSummary? } }`, using AgentActivitySession or AgentConversation fields.
- `{ kind: 'timeline', taskId, turnId?, source?, value: { dispatchSummary?, turnDispatchSummaries? } }`. An explicit turn reads only its own summary. Missing old turns never inherit the current summary. source=transcript reads the Agent catalog without treating the external transcript identity as an ARC task.
- `{ kind: 'task', value: { agent?, taskId?, threadId?, requestId, task } }`, using TaskRecord fields. Reads task.model, task.effort and the recorded task.dispatch.serviceTier when present; task.settings is not a tier contract.

`CatalogState` is `{ status: 'ready' | 'loading' | 'error', catalog?: DispatchCatalog }`. The catalog uses native `models: [{ model, name?, group?, options? }]` and optional `source`, `options`, `currentModel`, `optionsForModel`, `unavailable`. Each option has `id`, optional `category`, and `values: [{ value, name? } | string]`. A missing-model response can supply `models: { unavailable }`.

## Labels and states

Codex labels use native model/list displayName. Other Agents use existing dispatch catalogs: ACP session config-option names (including dsh), the older ACP models list when necessary, Pi RPC or installed registry, and Grok native cache/session snapshots. No model-name table or ID prettifier is used. JSON-encoded ACP model identities compare as whole identities. Before resolution completes, missing labels use a neutral loading label without exposing raw IDs in text, tooltips or accessible names; recorded effort and tier remain visible. Refreshes retain previously resolved labels. Only completed resolution without a label or catalog failure exposes the raw ID marked Unresolved. Missing specs show Spec not recorded.

Recorded efforts use matching model/session native labels when available, otherwise localized effort vocabulary. `priority` renders Fast. Missing fields stay missing. Narrow chips preserve effort and tier, drop provider/group suffixes from readable model labels first, then ellipsize the model name. Hover and keyboard focus reveal the full readable text in the shared tooltip. The accessible name always contains the full readable text. Raw IDs appear only for unresolved models, explicitly marked Unresolved.

## Canvas example

```js
const spec = Arc.fixtures.dispatchSpecs[1];
const renderVals = { record: spec.record, resolver: spec.resolver };
```

```html
<x-import component-from-global-scope="Arc.DispatchSpec" agent="dsh" record="{{record}}" resolver="{{resolver}}"></x-import>
```

`Arc.fixtures.dispatchSpecs` includes dsh, Codex, missing/older turns, absent tier, unknown model, loading and catalog failure. No backend calls occur in design mounts.
