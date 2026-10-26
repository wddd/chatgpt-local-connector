# Control-source capability profiles

MUST means a requirement.
SHOULD means the default unless a concrete task-specific reason justifies an exception.
MAY means an option.

## Scope and compatibility

Phase 1 covers profiles, progressive guide disclosure, and compact task results through the existing CLI.
Existing sources MUST retain their current discovery, execution policy, notification behavior, and CLI defaults until explicitly opted in.
The frozen boundaries are defined in [Tool surface](tool-surface.md), [Tools](../reference/tools.md), and [CLI](../reference/cli.md).
Profiles MUST NOT create a second dispatcher or authorization system.
`operations.rs` owns durable management receipts rather than the control-source operation catalog.
Profile changes MUST preserve its receipt replay and unconfirmed-write semantics.

## Profile model

| Dimension | Values | Meaning |
| --- | --- | --- |
| Host access | `host`, `none`, `unknown` | Whether the controller can operate this ARC host's shell, files, and Git directly. |
| Wait mode | `background-cli`, `push`, `poll` | How the controller revisits a dispatched task. |
| Transport | `cli`, `mcp` | The actual request entry point, independent of ingress transport such as HTTPS or relay. |

Host access MUST refer to the ARC execution host rather than the controller's own computer or cloud sandbox.

| View | Dimensions | Intended controller |
| --- | --- | --- |
| Legacy | No profile opt-in | Every existing source, including built-in Local CLI. |
| Local Code | `host` + `background-cli` + `cli` or `mcp` | A local Code session that can run ARC's CLI and receive its background-command completion. |
| Remote push | `none` or `unknown` + `push` + `mcp` | Chat or cloud Code with a supported notification return path. |
| Remote polling | `none` or `unknown` + `poll` + `mcp` | Chat or cloud Code without usable push delivery. |

A host-capable MCP controller MAY select polling when its client cannot run a background CLI wait.
Host-capable polling or explicitly selected push MUST retain Local Code's host-operation projection with the chosen wait workflow.

### Derivation and overrides

Resolution MUST start from the authenticated source record in `sources.rs` and the actual request entry point.
The reserved combination `ingressId:"local-cli"` and `credential.type:"local"` establishes built-in local authority.
The product name `local-cli` alone MUST NOT establish that authority.
OAuth grants identify individual sources on a shared ingress.
Authentication type, HTTPS, relay, and loopback addresses MUST NOT independently imply host access.
`control_sources.rs` and `shared/control-sources.json` SHOULD supply correctable product defaults.
The current `claude` product does not distinguish local Code, Chat, Cowork, and cloud Code.
ChatGPT, Grok, and remote Claude SHOULD be offered host access `none` during explicit profile setup.
Unknown products SHOULD start with host access `unknown` and polling.
Push selection MUST retain existing route binding and reachability verification requirements where applicable.
Missing push reachability MUST produce the existing repair path or an explicit polling fallback without claiming delivery.
Background CLI waiting MUST NOT require notification binding or a notification verification handshake.
Background CLI wait selection MUST require host access and controller-supported background completion.
The proposal adds `capabilityProfile` and dimension provenance to existing local source readback, with `capabilityProfile` writable through source update.
`arc cli source update <id> --stdin` with `{"capabilityProfile":{"hostAccess":"host","waitMode":"background-cli"}}` is the proposed Local Code override.
`{"capabilityProfile":null}` restores legacy behavior.
The local management boundary MUST own writes to this setting.
Transport MUST be observed per request rather than accepted as a caller-supplied identity claim.
An explicit override MUST take precedence over product defaults.
An override MUST follow the stable source ID across a connection switch.
Account merging MUST NOT copy a profile to sibling sources.
New sources SHOULD receive a proposed selection during setup before it is saved.
Built-in local authority MUST retain its non-revocable lifecycle and absence from ordinary account/source lists.
Local CLI profile setup SHOULD use its stable source ID returned by authenticated local readback through the existing source-update route.
The built-in local profile applies to all local CLI callers because those callers currently share one authority.

## Catalog projection

Profiles SHOULD filter initial discovery only.
Direct schema reads and execution MUST continue to use the existing effective op policy and runtime availability.
An op omitted from the initial guide MUST remain discoverable through `guide({op})` and the full view when permitted.
An op denied by the existing policy MUST remain unavailable through discovery and execution.
This trades automatic capability minimization for stable execution behavior and recoverable discovery.
Users requiring execution restrictions MUST configure the existing op allowlist.
The implementation SHOULD extend the existing `toolExposure.tools[op].presets` metadata for profile selections.
The implementation MUST reuse `group`, `tier:default|advanced`, `conditional`, `required`, and `requires` instead of creating a parallel capability registry.
The existing common/readOnly/all/custom policy selections MUST retain their meanings.
Profile selection MUST NOT rewrite persisted allowlists or expand them through dependency closure.
An explicit policy edit MUST continue to use existing dependency normalization and required ops, including `connector_verify`.
The policy exceptions for `guide`, `notification_ack`, `notify_status`, and `inbox_wait` MUST remain unchanged.
Profile discovery MUST preserve each op's existing `via` classification, including mixed ops that use `act`.

`1` means an initial-guide candidate within the character budget.
`D` means available on demand through a per-op guide or full view.
`C` means included only when the relevant workflow is needed.
Every cell is intersected with policy and runtime availability.

| Current operations | Local Code | Remote push | Remote polling | Legacy |
| --- | --- | --- | --- | --- |
| `guide`, `dispatch_policy`, `codex_create`, `codex_wait`, `codex_read`, `codex_review`, `receipt` | 1 | 1 | 1 | Current |
| `connector_verify` | D | C | C | Current |
| `agents`, `agent_create`, `agent_wait`, `agent_read`, `agent_review` | 1 | 1 | 1 | Current |
| `codex_send`, `codex_resume`, `codex_interrupt`, `codex_pending`, `codex_respond`, `codex_interactions` | D | D | D | Current |
| `agent_send`, `agent_interrupt`, `agent_pending`, `agent_respond`, `agent_capabilities`, `agent_tasks`, `agent_context`, `agent_events` | D | D | D | Current |
| `codex_tasks`, `codex_items`, `codex_changes`, `codex_queue`, `codex_queue_control`, `codex_owner`, `codex_release`, `codex_archive` | D | D | D | Current |
| `projects`, `command` | D | 1 | 1 | Current |
| `overview`, `tree`, `search`, `read`, `git`, `edit`, `write` | D | D | D | Current |
| `git_write`, `fs`, `process`, `file_search` | D | D | D | Current |
| `mcp`, `codex_thread`, `codex_account`, `codex_capabilities`, `codex_schema`, `codex_query`, `codex_call`, `codex_events` | D | D | D | Current |
| `control_output`, `events`, `logs`, `screen` | D | D | D | Current |
| `notify_control`, `notify_status`, `notification_ack`, `inbox_wait`, `request_route` | D | C | D | Current |
| `whoami`, `accounts` | D | D | D | Current |
| `account_update`, `account_merge`, `account_add`, `account_login`, `account_reauth`, `account_remove`, `account_browsers`, `account_notify` | D | D | D | Current |
| `context_resolve`, `context_search`, `context_read`, `context_check`, `context_amend` | C | C | C | Current |
| `board`, `coordination_session`, `notice_post`, `notice_update`, `notice_close`, `blocker_open`, `blocker_clear`, `messages`, `message_send`, `message_route` | C | C | C | Current |
| `task_timeline`, `task_reviews`, `task_review_undo`, `task_bubble`, `task_mark_read`, `task_panel`, `task_panel_control`, `task_open`, `task_resource` | D | D | D | Current |
| `src_conversations`, `src_chrome_profiles`, `src_conversation_open`, `src_login_import`, `src_conversation_bind`, `src_login_clear` | C | C | C | Current |
| `update_status`, `update_request`, `app_env`, `acceptance_fault` | D | D | D | Current |
| `ax_issue_draft`, `ax_report`, `ax_list`, `ax_candidate`, `ax_triage` | C | C | C | Current |

Chat profiles SHOULD lead with `command` for shell, Git, and edits while keeping specialized read/search operations discoverable.
Local Code SHOULD use its own shell, files, and Git for host work.
Quota and model selection SHOULD use the existing compact `dispatch_policy` decision view.
Optional Agent entries MUST disappear when the existing availability check excludes them.
SRC operations currently lack explicit `toolExposure` entries and use the generic fallback.
Profile implementation SHOULD classify those entries in `toolExposure` without adding them to existing policy snapshots.

## Progressive guide disclosure

Layer 1 is `guide()` or `query({op:"guide",args:{}})` with the source's effective profile.
Local Code's uncached Layer 1 result MUST target at most 2,500 Unicode characters in its complete serialized result, including the index, examples, hashes, and CLI path.
Transport envelope overhead and duplicate MCP text MUST be measured separately.
Remote profiles SHOULD target at most 4,000 characters before an explicitly requested detailed topic.
Layer 1 MUST contain the normative vocabulary, effective workflow, dispatch-policy step, dispatch/wait/review skeleton, receipt recovery, and discovery links.
The budget MUST include enabled conditional guidance rather than allowing unbounded appended sections.
Layer 2 is `guide({op:"codex_create"})` or `query({op:"guide",args:{op:"codex_create"}})`.
Layer 2 MUST return the complete permitted input schema, signature, example, `via`, and retry contract.
Layer 3 is `query({op:"guide",args:{view:"full"}})`.
Layer 3 MUST expose every policy-enabled, available op even when it is absent from Layer 1.
Layer 3 SHOULD include the detailed workflow for the selected profile rather than every product's workflow.
The frozen `guide` tool MUST NOT gain a `view` or `profile` parameter.
Notification prose and event examples MUST appear automatically only for push profiles.
Coordination prose MUST appear automatically only when the source is participating in shared coordination or the user has selected that workflow.
SRC prose MUST appear automatically only for source-conversation management or an associated conversation-binding workflow.
Maintainer prose MUST retain the existing Maintainer-mode gate.
An explicit related topic or op request MUST disclose its details regardless of automatic prose suppression.
The `guideHash` MUST cover the final projected response, including effective profile and conditional sections.
Local profile changes MUST invalidate the projection hash without requiring a new catalog `arcVersion`.
Published guide and op-schema changes MUST continue to change `arcVersion` through the existing visible-contract hash.
Minimal MCP text MUST remain a separate opt-in setting rather than a hidden profile side effect.

## Code-oriented CLI flow

`cli control` already forwards op arguments through the control dispatcher with built-in local authority.
`cli wait` already performs bounded read waits and returns `matched`, `elapsedMs`, and `lastResult`.
The controller's background-command facility owns session re-invocation when the CLI exits.
ARC MUST NOT promise re-invocation when that client facility is unavailable.

```sh
arc cli control guide
arc cli control dispatch_policy
arc cli control guide codex_create
printf '%s' '{"project":"/workspace/project","prompt":"Implement the requested change.","purpose":"task","notify":null}' | arc cli control codex_create --stdin
# Retain the returned requestId, threadId, and turnId; read receipt if dispatch is pending.
# Run this command through the controller's background-command facility.
# Proposed op argument: view:"summary".
printf '%s' '{"threadId":"<threadId>","turnId":"<turnId>","until":"terminal-or-interaction","view":"summary"}' | arc cli wait --control --op codex_wait --stdin --until '/conditionMet==true' --timeout 1800
# Inspect lastResult, review local changes, and obtain another Agent's assessment when needed.
printf '%s' '{"threadId":"<threadId>","turnId":"<turnId>","verdict":"pass","note":"Reviewed the change and validation evidence."}' | arc cli control codex_review --stdin
```

Normal work MUST set `purpose:"task"` because the existing local CLI dispatch default is `self-test`.
Timeout recovery MUST retain task identifiers and read the original task rather than resubmitting dispatch.
Interaction exits MUST direct the controller to the existing pending/respond operations.
CLI success means the wait condition matched rather than that the task succeeded.
`codex_review` and `agent_review` record verdicts rather than launch an independent model review.
Cross-model review SHOULD dispatch a separate review task through `codex_create` or `agent_create` before recording the verdict.
The minimum result additions are opt-in `view:"summary"` on `codex_wait`, `codex_read`, `agent_wait`, and `agent_read`, plus `turnId` on Codex reads for pinned recovery.
The summary SHOULD reuse the existing `codex_read` review projection and `codex_changes` attribution logic.
The summary MUST retain task/turn identifiers, task status, wait state, `conditionMet`, snapshot hash, errors, and actionable `next` fields.
The summary SHOULD include a final-message excerpt capped at 800 characters, up to 50 changed paths, and aggregate diffstat.
The summary MUST expose truncation and a continuation to complete evidence.
Changed files and diffstat MUST describe the selected turn's observed changes rather than all current worktree changes.
Unavailable attribution or Agent change evidence MUST be null with a reason rather than an empty successful result.
Diffstat SHOULD include file count, added lines, deleted lines, and explicit unknown or binary counts where applicable.
Omitting `view` MUST preserve existing complete terminal replies and current read defaults.
This design needs no new top-level CLI command, background daemon, notification route, or result envelope.
An optional `skills/` Claude Code skill MAY package the same discovery and background-wait flow.
The skill MUST read live op schemas rather than embed a second policy or model catalog.

## Frozen surfaces

MCP tools MUST remain `guide({topic?,op?})`, `query({op,args})`, and `act({op,args,requestId?})`.
MCP results MUST retain their current content and structured-result envelopes.
The event name MUST remain `notification` with subscription parameters `{op,args}`.
Suppressing notification guidance MUST NOT revoke subscriptions, acknowledge events, or alter delivery.
CLI output MUST retain `schemaVersion:1`, `ok`, and the existing success/error/next structure.
Compact wait data belongs inside the existing `result.lastResult` payload.
CLI timeout MUST retain `WAIT_TIMEOUT` and its existing `error.lastResult` placement.
Authorization, source isolation, resource boundaries, and replay protection MUST remain independent of profile selection.

## Measurement

Comparison SHOULD use `cli stats control --since <duration>` and content-free rows from `control_metrics.rs` over equivalent task cohorts.
The current report does not expose an authenticated conversation-session identifier or calls-before-dispatch metric.
A source sequence separated by the existing 300-second inactivity threshold SHOULD serve as an explicitly labeled session proxy.
Concurrent conversations sharing a source and all built-in local CLI callers MUST be reported as attribution limitations.

| Measure | Existing evidence and proposed aggregation |
| --- | --- |
| Guide bytes per session proxy | Sum guide `responseBytes`, `textBytes`, and `structuredContentBytes` separately within each source sequence; report median and p95. |
| Calls before first successful dispatch | Count calls preceding the first successful `codex_create`/`agent_create`; require returned task identifiers or a linked successful receipt. |
| Invalid-argument retries | Compare `errorCode:"INVALID_ARGUMENTS"` counts and `wasteCandidates.argumentErrorRetries`, normalized per 100 dispatch attempts. |
| Discovery repetition | Compare `unchangedReads`, `uncachedUnchangedReads`, and `lookupThenAct` alongside guide cache requests. |
| Completion cost and quality | Compare task calls/bytes through recorded review, dispatch error rates, and sequences with no successful dispatch. |

Phase 1 metrics SHOULD add effective profile, transport, guide layer, and dispatch outcome as bounded metadata for cohort and success attribution.
Per-sequence guide totals and calls-before-dispatch SHOULD be report aggregations rather than new content logs.
An absent error code alone MUST NOT count an unconfirmed or pending receipt as successful dispatch.
Byte counts MUST NOT be presented as token counts or confirmed client context consumption.
Lower guide cost MUST NOT be accepted at the expense of more failed dispatches or hidden interaction recovery.

## Phasing

Phase 1 MUST deliver opt-in source profiles, catalog projection, guide layering, compact CLI task results, and the metadata needed to compare them.
Later multi-device targeting SHOULD carry an explicit target through the relay with authenticated device identity and target-specific availability.
Host access MUST then be evaluated against the selected device rather than assumed from the controller's local profile.
Later cross-source project context SHOULD reuse existing context-provider and coordination boundaries with source attribution and explicit project scope.

## Contract-test impact

`tests/contract/` is a protected destination with no cases present in this source layout.
Any relocation or new case under `tests/contract/` requires an explicit dispatch grant.
This proposal requires no modification to `tooling/test-policy-allowlist.json`.

| Existing file and exact case | Required coverage |
| --- | --- |
| `tests/control-mcp.test.ts`: `MCP lists frozen tools and guide exposes existing ops and native domains with valid object schemas` | Preserve frozen names, parameters, and valid per-op schemas. |
| Same file: `tool presets use the full registry, preserve exact allowlists and close only necessary read dependencies` | Preserve exact saved policies while reusing exposure metadata. |
| Same file: `real HTTP ingresses isolate discovery and direct execution; policy PUT preserves identity, metadata and peer availability` | Prove profile omission does not deny execution or broaden policy. |
| Same file: `guide progressively discloses every enabled op and caches projected content` | Cover legacy defaults, profile projection, full discovery, and hash invalidation. |
| Same file: `control stats report byte baselines and waste candidates without call content` | Cover cohort metadata and sequence aggregates without retaining content. |
| Same file: `minimal MCP text is opt-in per source and preserves structured results and errors` | Keep text mode independent of profiles. |
| Same file: `wait omits repeated nonterminal text and retains complete terminal replies` | Preserve defaults while covering explicit summaries and interactions. |
| Same file: `review read returns complete outcomes without command outputs or intermediate messages` | Keep complete review evidence available behind summary continuation. |
| Same file: `historical review file counts stop at the next clean turn baseline` | Preserve turn attribution in summary diffstat. |
| Same file: `AX2 CLI guides accept full views and subcommands expose help without execution` | Preserve CLI guide routing and envelopes. |
| Same file: `common guide discovers shared coordination in normal mode` | Preserve legacy visibility and add conditional opt-in discovery. |
| Same file: `source connection switching binds consent and preserves disconnected identities` | Keep overrides on the stable source and isolate OAuth peers. |
| Same file: `Maintainer mode defaults off, persists and switches guide content and common index live` | Retain the gate while enforcing the profile budget. |
| `tests/cli-failures.test.ts`: `Direct CLI failures retain schema-valid recovery and fail the process` | Preserve failure envelopes and actionable recovery. |
| Same file: `Interrupted task reads and waits succeed through the CLI envelope` | Preserve distinction between terminal task outcome and CLI failure. |

Owner-authorized new contract cases SHOULD cover profile migration, the 2,500-character budget, unchanged event schemas, summary truncation, missing attribution, and background-wait timeout recovery.
Every future case MUST assert public operation or CLI behavior with exactly one permitted test-policy comment.

## Decisions requested

1. Should profile selection affect discovery only, as recommended, or also materialize an explicitly approved existing-policy allowlist?
2. Should new-source setup offer profiles immediately while existing sources remain legacy, as recommended?
3. Is one shared Local Code preference for built-in local authority sufficient for Phase 1?
4. Should opt-in summaries use the proposed 800-character message and 50-path limits with complete-evidence continuations?
5. Should Phase 1 ship the optional Claude Code skill or only document the CLI flow?
