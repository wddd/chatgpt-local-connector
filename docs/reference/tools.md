# MCP tools and operations

[Home](../../README.md) · [Concepts](../concepts.md) · [CLI](cli.md)

## Provider accounts

`query({op:"whoami",args:{}})` returns `{id,alias,provider,email,orgName,plan,sourceId,platform,agentProfiles,notifications,identityResolution}` for the authenticated calling source. ARC uses provider authorization facts and confirmed Claude cloud-session handshakes, never client names. External control sources without either receive separate `Unidentified` accounts. Built-in Local CLI and panel authority has no provider account: local `whoami` returns `authority:local`, `id:null` and `identityResolution.state:not-applicable`. Source IDs and historical origins remain stable; successful resolution can merge the provisional account into the provider account.

`identityResolution.state` is `unresolved`, `resolved` or `conflict`. Provider facts have `authorization:{kind:"authorization",identityKey,observedAt}`. A confirmed Claude handshake has `evidence:{kind:"claude-session-handshake",sourceId,target,profileId,accountId,identityKey,confirmedAt}`. Account detail/list expose the same records in `sourceIdentities` keyed by source ID; source reads expose `identityResolution`.

Use `notify_control({action:"bind",target,accountId?})` (or `route` followed by `verify`) and acknowledge the code actually received with `notification_ack({target,code})`. ARC pins the sending profile and records its CLI identity before sending. Only the valid source-bound acknowledgement links the source to that account. Binding, session visibility and send success alone do not resolve identity. Missing CLI identity leaves it unresolved; repeat verification after sign-in. Changing the route invalidates the pending challenge. Old verified routes without identity evidence require a fresh handshake.

`notification_ack` returns `identityResolution` alongside `reachability:"verified"`. A conflict has `state:"conflict"`, `code:"ACCOUNT_IDENTITY_CONFLICT"`, `reason`, the retained `accountId` and proposed `evidence`; an earlier handshake may appear as `previousEvidence`. It does not overwrite an existing confirmed identity. Later provider authorization facts take precedence and retain a conflicting handshake as evidence. Conflicts remain visible through `whoami`, sources and accounts (`health.state:"attention"`), including dispatch policy. Inspect the accounts and verify the intended target again to reconcile; successful delivery can coexist with an identity conflict.

`query({op:"accounts",args:{agent?}})` returns `{accounts,login}`. Each account has `id`, `provider`, `identityKey`, `alias`, `plan`, timestamps, `sources` (source ID strings), `agentProfiles`, `notifications`, `quota` and `health`. List entries omit `email` and `orgName`. `accounts({id})` returns one full account object, including those fields. Privacy preferences never redact AX. Profiles are `{agent,profileId,kind,state,default}`. At most one profile per Agent is default. Equal provider identity keys merge sources and profiles, retaining a tombstone for an already issued account ID.

| Action | Arguments | Result |
| --- | --- | --- |
| `account_update` | `{id,alias?,defaultFor?,default?}` | Full updated account |
| `account_add` | `{kind:"claude"|"codex"|"api-key"|"detect",browserId?}` | `{loginId,kind,state,loginUrl?,accountId?,error?,browserError?}` |
| `account_login` | `{loginId,action:"code"|"cancel",code?}` | Login progress or `{submitted:true}` |
| `account_reauth` | `{id,agent}` | New login progress |
| `account_remove` | `{id,running:"finish"|"cancel"}` | Retained account with `removedAt`, `health.state:"removed"`, and `displayName` |
| `account_notify` | `{id,action:"send"|"test"|"bind",target,message?}` | Binding or delivery result |

`account_update({id,defaultFor:"claude"})` selects the account for that Agent (`default:true` is equivalent). `{id,defaultFor:"claude",default:false}` clears only that account's default; it leaves another account's default unchanged. `default` requires `defaultFor`. Clearing persists across refresh and restart without an automatic replacement. Dispatch without `account` then reports `ACCOUNT_DEFAULT_MISSING` until a default is selected. The first profile of a previously unconfigured Agent is initially default.

Poll `accounts` for login progress. `account_browsers` returns `{browsers:[{id,name}]}`; omit `browserId` for the system browser. Claude code submission uses the official CLI's stdin. Codex completes its browser callback; a pasted code returns `ACCOUNT_LOGIN_CODE_UNSUPPORTED`. `detect` reads native authentication and imports the system Claude profile. Key-based Agents expose one native `api-key` profile each. Their generic login protocol and provider identity are not standardized: `account_add({kind:"api-key"})` returns `unfinished` with a native-authentication instruction, and unknown profile auth remains `unfinished`. It does not claim a successful sign-in or accept/store an inference key. Native-specific login remains required for those Agents.

`codex_create`, `codex_send`, `agent_create` and `agent_send` accept `account` as an ID or unique alias. Omission selects the Agent's default. Ambiguous aliases fail. Claude children use the selected isolated CLI configuration. Codex has one current native home, not multiple concurrently signed-in homes. Sending to an existing non-Codex task cannot switch its execution profile. Receipts, task records, dispatch records and activity carry `agentAccountId`; origins carry `accountId` beside `sourceId`. Existing history is not rewritten. Read-time labels expose `agentAccountAlias`, `agentAccountRemoved` and `agentAccountLabel` for retained IDs.

Removal hides the account from lists and prevents new account selection. `finish` retains credentials for existing work; `cancel` interrupts matching live Agent tasks and Codex timelines. It does not revoke the provider's grant or disconnect sources. Reading the removed ID retains its identity and alias. Signing out through the native CLI leaves the account and sources intact.

Notification sessions, source routes and host routes remain attached to their owning account and execution profile. Claude verification still requires the existing `notify_control` handshake and acknowledgement. `notifications.state` is `verified`, `not-bound`, `mcp-events`, `n/a` or `removed`; `reachable` reports observed delivery-channel reachability. MCP Events sessions expose reachability without callback credentials. Agent-only accounts have `n/a` unless a Claude notification route is bound. A send/test receipt is delivery evidence, not receiver acknowledgement.

Quota detail uses the selected native profile. Full account reads refresh Claude/Codex quota after three minutes; lists and `dispatch_policy.agents[].accounts` expose the saved observation. Unknown quota has `state:"unavailable"`, never zero usage. Profile reads do not assign the system Claude quota to every isolated identity. Unsupported key-based providers remain unavailable.

The local management API uses `GET accounts`, `GET accounts/{id}`, `POST accounts/query`, `POST accounts/whoami`, and `POST accounts/{add,login,reauth,update,remove}` with the corresponding op arguments as the JSON body. Browser discovery is `GET accounts/browsers`; notification actions are `POST accounts/{id}/{send,test}` with `{target,message?}` and `PUT accounts/routes` with `{accountId,target}`. `ui/api.ts` exports typed `accountsApi` helpers. The former `claude-accounts/*` management routes are removed. Migration retains the Claude credential directories because their paths participate in the native keychain namespace; host route storage moves to the account store. Source IDs, notification ownership and execution profile IDs are preserved.

## Discovery and policy

The public MCP surface is frozen at three tools. Call `guide` first; use `guide({"op":"codex_create"})` for a single op’s full schema and example.

| Tool | Input | Annotation |
| --- | --- | --- |
| guide | `{topic?: "loop"\|"notify"\|"review"\|"approvals", op?: string}` | readOnlyHint=true |
| query | `{op: string, args: object}` | readOnlyHint=true |
| act | `{op: string, args: object, requestId?: string}` | readOnlyHint=false |

`args` is open at the MCP boundary and validated against the current op schema. The default `loop` guide returns core rules and common enabled ops. Use `query({"op":"guide","args":{"view":"full"}})` for the complete enabled op index, dispatch workflow, examples, and event contracts. Existing `notify`, `review`, and `approvals` topics remain available. `op` takes precedence over topic and view. Each index row gives `op`, `via`, and a compact `signature`; a single-op response includes the full schema and example.

Every guide response includes `guideHash`. Reuse it with `query({"op":"guide","args":{"knownGuideHash":"<hash>"}})` for the same view, topic, or op. Matching content returns only `guideHash` and `unchanged:true`, plus the normal ARC version. The hash covers source-specific limits, enabled ops, and configured context guidance. A different view or policy returns fresh content. `view` and `knownGuideHash` are query-op parameters only; the three frozen MCP tool schemas remain unchanged. Cached clients can also request individual schemas through `query({"op":"guide","args":{"op":"codex_create"}})`.

Guide signatures and per-op schemas advertise only canonical parameter names: `operation` for Git and `lineCount` for reads. Legacy aliases remain accepted by execution, with no deprecation response. Conflicting canonical and legacy values still fail validation.

The embedded [catalog](../../native/src/catalog.json) defines the fixed tools and current op registry. Names of the former tools remain op names, without tool aliases. The table below lists each op’s assigned entrypoint; mixed read/write ops such as receipt, screen, mcp, and codex_thread always use act, even for a read action. Assignment follows readOnlyHint, with connector_verify marked as a write because it saves verification state.

| Group | Ops via query | Ops via act |
| --- | --- | --- |
| Default | `context_resolve`, `context_search`, `context_read`, `context_check`, `guide`, `dispatch_policy`, `projects`, `overview`, `tree`, `search`, `read`, `git`, `codex_tasks`, `codex_queue`, `codex_queue_control`, `codex_read`, `codex_wait`, `codex_items`, `codex_pending`, `control_output`, `codex_changes`, `logs` | `context_amend`, `connector_verify`, `screen`, `command`, `codex_create`, `codex_send`, `codex_review`, `codex_interrupt`, `receipt`, `codex_respond`, `edit`, `write` |
| Accounts | `whoami`, `accounts`, `account_browsers` | `account_update`, `account_add`, `account_login`, `account_reauth`, `account_remove`, `account_notify` |
| Advanced | `codex_account`, `file_search`, `codex_capabilities`, `codex_schema`, `codex_query`, `codex_events` | `git_write`, `fs`, `process`, `mcp`, `codex_thread`, `codex_call` |
| Conditional default | `agents`, `agent_capabilities`, `agent_tasks`, `agent_read`, `agent_context`, `agent_wait`, `agent_events`, `agent_pending` | `agent_create`, `agent_send`, `agent_interrupt`, `agent_respond` |

Default stores an explicit op allowlist; All enables the registry; Custom stores an exact selection. Read-only retains connector_verify through act as its connection-maintenance exception. Saving a selection includes necessary receipt, status, wait, and output dependencies. Existing allowlists retain their op names; guide is always available through both its fixed tool and the query op, even when absent from a saved allowlist.

`tools/list` always returns the same three definitions, including on an empty allowlist. Except for guide, disabled ops are omitted from guide and rejected with OP_UNAVAILABLE. Conditional ops require an available, enabled non-Codex Agent. Refresh local Agent discovery, then call guide again; no client tool refresh is needed for op changes. Saved allowlists do not grow automatically; reselect a preset to adopt new ops.

Every tool result carries `arcVersion`, a short SHA-256 of the guide text, public tool/event contracts and all op schemas/signatures/examples. Builds and internal catalog metadata do not affect it. Reread guide when it differs from the version last read. Object results gain this field; array, scalar, and null results are wrapped as `{value, arcVersion}`. Successful calls attach eligible unread arcInbox events under the notification scope below. Policy and availability are checked live; the catalog version does not change when a local policy changes.

INVALID_ARGUMENTS gives a field path, a short reason, a nearby supported parameter name when available, and a query guide call for the current schema. Error responses put error first in the text result, omit the full schema and inbox events, and do not consume unread inbox events. UNKNOWN_OP supplies up to three closest enabled op names and points to guide. WRONG_TOOL supplies the assigned entrypoint. These are MCP tool errors (`isError=true`) with arcVersion, so a client can correct the call once without refreshing its cached tools.

Upgrading from the former tool surface requires one client tool refresh and renewed authorization. Later capabilities change through ops and guide.

## Context provider

An optional context provider supplies standard practices for the user's environment through an external MCP stdio server. Configure zero or one provider in `context-provider.json` under the ARC state directory (`ARC_STATE_DIR` when set). The defaults are `~/.local/state/agent-remote-control` on macOS, `$XDG_STATE_HOME/agent-remote-control` (or `~/.local/state/agent-remote-control`) on Linux, and `%LOCALAPPDATA%/agent-remote-control` on Windows.

```json
{
  "command": "/absolute/path/to/context-provider",
  "args": ["serve"],
  "env": {"EXAMPLE_SETTING": "example-value"},
  "cwd": "/absolute/path/to/provider-workspace"
}
```

`command` is required; `args`, `env` and `cwd` are optional. Use an executable accessible to the Core, preferably an absolute path. Environment overrides extend the Core process environment. ARC reads the file on each call; no restart is needed. Remove the file or set its JSON value to `null` to disable the integration. ARC does not create this configuration automatically. Keep private configuration outside the repository.

Each call starts a process, performs MCP initialization, invokes one tool, and terminates the process. `resolve` calls for dispatch injection have a three-second timeout. Proxy ops `context_resolve`, `context_search` and `context_read` allow 10 seconds; `context_amend` and `context_check` allow 120 seconds. ARC's stdio MCP forwarder allows 150 seconds for these two long ops so it can receive the provider result or timeout. External MCP clients should also allow at least 150 seconds; provider ops have no `waitMs` override. Results use MCP `structuredContent` when present, otherwise JSON decoded from text content. There is no cache or automatic retry.

| ARC entrypoint | Provider tool and arguments | Provider result |
| --- | --- | --- |
| query `context_resolve` | `resolve({project?, intent?, caller?, budgetChars?})` | `{entries:[{id,title,scope,path,verified,avoid,body}], truncated}` |
| query `context_search` | `search({query, scope?, limit?})` | `{entries:[{id,title,scope,projects,intents,verified,snippet}]}` |
| query `context_read` | `read({id})` | One full entry |
| query `context_check` | `check({id?})` | Per-entry pass/fail results |
| act `context_amend` | `amend({id?, content, reason, caller?, expectedVersion?})` | `{id, path, commit}` |

Arguments and results are passed through under ARC's normal result envelope. Provider ops return `CONTEXT_PROVIDER_NOT_CONFIGURED` when no provider is configured. Existing ingress allowlists must enable these ops (or reselect the Common/Read-only preset for the corresponding ops). `context_amend` forwards the write directly; an outer act `requestId` is not sent to the provider and does not provide ARC receipt replay. If an amendment times out, read the entry before deciding whether to retry.

`codex_create`, `codex_send`, `agent_create` and `agent_send` submit the original prompt/input without resolving or injecting context. Dispatch `context` and `intent` arguments are deprecated: accepted but ignored. Dispatch receipts and records contain no provider entry IDs or provider warnings.

When configured, the loop guide recommends `context_resolve`/`context_search` before planning project or infrastructure work. Dispatch does not inject context. Controllers can query `context_*` ops while planning; agents query their configured MCP servers on demand. When a user corrects a practice, first `context_read` the entry, then `context_amend` it, putting the old practice in `avoid`. Current observed facts take precedence. Record cross-agent operational knowledge through `context_amend`. Global behavior rules and tool parameter documentation belong to their respective owners; do not keep operational knowledge only in an agent's own memory. Project-internal code conventions stay in the project repository. Personal criteria belong in local state configuration, not the public guide. Controllers search first and update the existing entry instead of creating duplicates, following the provider's amend description and error messages.

## Project facts and files

`projects` reads the native `project/list` pages. Project selectors accept a native ID, unique name, or absolute directory; a multi-root project selects the unique directory whose basename matches the project name, or the sole Git repository root. Use `root` to select a registered root by its name, directory basename, or a relative path ending at that root (for example, `packages/client`). Ambiguous selections list the available roots. Existing project-only calls retain their automatic root selection. ID/name resolution caches the catalog for 30 seconds. Absolute `read`, `tree`, and `search` paths can omit project; relative paths require it. Git revision reads require project.

`tree` and `search` normally use Git working files; `includeIgnored: true` includes ignored files. `read` can address ignored files directly. Text reads paginate by lines with `lineCount`. Search accepts positive limits above 50 and caps each page at 50 results. Tree/search use nextOffset. Non-Git tree reads stop at the requested depth; a scan exceeding 10000 entries falls back to a bounded first layer with `truncated:true` and `depth:1`. Narrow the path to explore omitted descendants. Read results include metadata and hashes. Search returns per-file matches without hashes by default; `view:"full"` adds sha256. A single top-level readNext shows how to read any result path. `view: "review"` applies the workspace resource boundary. `includeSource: true` adds observation metadata where supported.

```text
query {"op":"read","args":{"path":"/absolute/project/README.md"}}
act {"op":"edit","args":{"path":"/absolute/project/file.txt","edits":[{"oldText":"before","newText":"after"}],"expectedHash":"<sha256>"}}
act {"op":"write","args":{"path":"/absolute/project/new.txt","content":"hello\n"}}
```

`edit` applies all replacements in memory before an atomic file replacement. Empty oldText, missing matches, or ambiguous matches without replaceAll fail the whole operation. `expectedHash` checks existing content. `write` creates parent directories and creates or replaces a UTF-8 file. Existing permissions are preserved by edit. Active-task notices do not block a write.

`git` reads status/history/diffs. Diffs above 12000 UTF-8 bytes return a bounded preview, `truncated:true`, file-level added/removed counts (up to fifty files), and `output.outputId`. Read `control_output` from offset 0 to reconstruct the immutable JSON containing complete text and file statistics, or narrow with path; `git_write` performs its cataloged mutations with receipts. `file_search` exposes fuzzy filename search. `fs` exposes native writes and watches with base64 contents and native path semantics; use the upstream schema for parameters.

## Codex tasks

```text
act {"op":"codex_create","args":{"project":"/absolute/project","prompt":"Read the project and summarize its structure."},"requestId":"<fresh UUID>"}
query {"op":"codex_wait","args":{"threadId":"<returned ID>","turnId":"<returned turn>","timeoutMs":30000}}
query {"op":"codex_read","args":{"threadId":"<returned ID>"}}
query {"op":"codex_changes","args":{"threadId":"<returned ID>","turnId":"<returned turn>"}}
```

`codex_create` waits up to 45 seconds for its receipt by default; `codex_send` remains at 25 seconds. Explicit waitMs overrides these defaults. A timeout returns pending with the same requestId for receipt reads.

Before dispatch, call `query({"op":"dispatch_policy","args":{}})`. Use `agent` to filter. The default `view:"decision"` returns installed and enabled agents. `all:true` includes the full registered inventory in either view. Each decision row includes availability, quota summaries, configured default model and effort/options, criteria and compact history. Agents without criteria or history show `no policy`. Nonempty defaults and allow/deny restrictions remain visible. Models use one entry per model, such as `model-id: low-ultra, fast=priority`. Shared quota pools appear once with references from subsequent agents. Percentages indicate usage, not remaining capacity. `view:"full"` returns detailed native capabilities, quota windows, policy and history. Both views omit null, empty and unknown values. Observation timestamps appear only for stale data or persistent capability snapshots. Unavailable reads remain explicit. Quota is advisory.

Criteria include `criteriaHash`. Pass `knownCriteriaHash:"previous-hash"` or `knownCriteriaHash:{"agent-id":"previous-hash"}` to omit matching text and receive `criteriaUnchanged:true`. A string omits any criteria matching that digest. The map key `global` addresses top-level criteria. Agent criteria and hashes are on each decision row or under its `policy` in the full view. Changed text is returned with its new hash.

Explicit ingress allowlists must enable this op. The default preset includes it. The state-directory `dispatch-policy.json` is created on first use as two-space-indented JSON with a final newline. It is reloaded on each query and dispatch. Preserve this formatting when restoring backups. Top-level criteria guide agent selection. Missing agent sections are empty policies. Native defaults apply when model, effort or options are absent. Queries do not rewrite existing files. The `codex` object contains model, effort, serviceTier, serviceTiers (model-ID overrides), criteria and optional allowModels/denyModels/allowEfforts/denyEfforts lists. Empty allow lists are unrestricted. Deny lists win, including for defaults. Invalid policy files fail explicitly.

Other Agent rows include capabilities from existing session snapshots and quota from the same SubscriptionService used by the UI. Use both agent and taskId for a specific non-Codex session; otherwise the latest nonempty snapshot is selected. Sources and observation times distinguish persisted snapshots, live ACP snapshots and live Pi RPC reads. A null observation time means an older record did not capture it. Queries never start or resume sessions, or send RPCs to disabled Agents. With no snapshot, capabilities reports unavailable. The unfiltered query previews at most eight models per non-Codex Agent and reports omittedModels; filter by agent for its full catalog. Native model IDs, including encoded variants and grouped values, are preserved. Configuration evidence has session scope and does not prove the model used for inference. authentication.inference remains unknown; quotaAccess describes only access to each quota provider. Unintegrated providers and unknown model-to-quota associations are explicit. Non-Codex rows return selectionSupported:true, per-Agent policy and history. agent_create/agent_send accept model, options, reason and purpose; explicit choices override policy defaults, then native current values. The model is set first and options are read again before other setters and prompt submission. Configuration failures return promptSubmitted:false with confirmed session values. See [Agent dispatch and acceptance](agents.md#dispatch-policy-and-acceptance) for evidence levels and agent_review.

Pass model, effort and a short reason following the user criteria. Native collaboration settings take precedence over turn fields, then top-level convenience fields, then thread.model for creation, then policy defaults; ARC aligns the submitted thread and turn settings. Both dispatch ops retain reason and per-field source (explicit / policy-default; steer uses active-turn). Requests replay before policy selection. Queue defaults resolve at execution time. Each successful submission records requestId, turnId, configuration, reason, source and submittedAt in task metadata; full task listings expose dispatches, and terminal notifications include the turn's records. Terminal observations add observedDurationMs (submission to first terminal observation, not pure model runtime) and native persisted effectiveConfiguration when available. When turn_context lacks service_tier, effectiveConfiguration.serviceTier stays unknown. Its separate threadServiceTier snapshots the last persisted thread_settings_applied before task_started; this confirms thread settings, not a per-turn tier override. History uses native per-turn tier when available, otherwise submitted tier, otherwise unknown. Review verdicts are submitted with codex_review, described below. These op constraints do not restrict direct native API calls or Codex UI choices.

After reviewing a terminal turn, call `act({"op":"codex_review","args":{"threadId":"<thread>","turnId":"<turn>","verdict":"rework","note":"Acceptance failed"},"requestId":"<fresh UUID>"})`. verdict is pass or rework; note is optional. Omitting turnId selects the native thread's most recent terminal turn, skipping active turns. Any existing terminal turn in a readable thread can be reviewed, including turns started directly in Codex Desktop. The per-turn review contains verdict, note, reviewedAt, requestId, reviewer (sourceId, controlSource, sessionId and target when known), dispatchOrigin (arc or external), and dispatchRequestId (null for external). External reviews capture native model/effort/serviceTier when available, otherwise null; the latest write replaces the previous verdict. Replay the same requestId for retries; use a new one to change a verdict. After rework, the next new-turn dispatch in that thread records reworkOf pointing to the reviewed turn; steer does not consume the link. Later verdict changes do not rewrite existing links. Queued sends link at execution time. Full task listings expose current reviews; completion events remain snapshots. Existing explicit ingress allowlists must enable codex_review.

The Codex row's `history` in `dispatch_policy.agents` aggregates new turns submitted in the last 30 days by effective model/effort/serviceTier (submitted values if native evidence is unavailable). Each group returns dispatches, pass, rework, failed, interrupted and unreviewed. Failed/interrupted turns are counted separately, ahead of verdicts; active and unreviewed successful turns count as unreviewed. medianObservedDurationMs and durationSamples only use successful terminal observations. Same-turn duplicates and steer do not count as new dispatches. purpose:self-test is excluded; sends without purpose inherit the previous dispatch's purpose. Eligible external reviews share the same grouping only when model and effort are known. They use reviewedAt for the 30-day window and appear separately as external:{reviews,pass,rework}; they never alter ARC dispatch/outcome counts or duration samples. External failed/interrupted turns count by their review verdict. Full task/read results expose reviews for both origins. The decision view merges groups with fewer than 3 total ARC dispatches plus eligible external reviews into `other` before calculating its median from the underlying duration samples. It reports median minutes and pass/rework/unreviewed counts, plus nonzero failed/interrupted counts. The full view retains individual groups and millisecond durations. Empty groups are omitted. At most 12 groups are returned, ordered by ARC dispatches plus eligible external reviews, with omittedGroups when truncated. Reviews are read fresh on each query.

Current native Turn/turn-completed/history data has no complete per-turn token total. thread/tokenUsage/updated includes turnId but last is the latest model response and total is thread-cumulative; account/usage/read reports estimated thread usage. ARC does not use these as per-turn totals or compute differences. Per-turn tokens and their average remain absent, not zero, until directly attributable complete native usage is available.

`codex_create` accepts prompt or native input; input takes precedence. `thread` and `turn` forward native parameters. Explicit native parameters take precedence over convenience fields. Omitted model and effort independently use ARC defaults from dispatch-policy.json (initially gpt-6-astra / medium), including new turns sent to existing threads. Omitted serviceTier uses the final model’s serviceTiers override, then global serviceTier; null/absent defaults inherit native settings. Factory defaults have no tier preference. Fast uses priority, standard speed uses default; fast is a catalog speed label. Explicit tier wins: turn.serviceTierForTurn, turn.serviceTier, top-level serviceTier, thread.serviceTier. A serviceTierForTurn override does not change thread defaults. Each new turn reselects policy tier, including model switches. Tier source is explicit, policy-default or native-default; active steer retains active-turn configuration. Permissions and approval policy inherit native host/task settings. `mode` presets are read-only, workspace-write, or danger-full-access; the first two default networkAccess to false when selected explicitly. networkAccess alone requires a complete permission policy.

`codex_send` continues the existing owner. Active-turn steering changes input only; explicitly requesting different model/effort returns ACTIVE_TURN_CONFIGURATION. Wait for the active turn or queue a new one to change settings. An unloaded Desktop thread is opened and its owner awaited before sending. Only if that load still explicitly reports no owner does ARC resume the same thread in its own App Server; disconnects, timeouts and uncertain turn submissions never trigger another submission. Desktop resume loads the thread but does not apply App Server configuration overrides. Unsupported thread/turn extensions are rejected. Background sends resume a notLoaded session with metadata only before starting a new turn. Desktop creation sets a title to materialize the seed, then confirms persistence through an independent metadata reader; it never polls rollout file size or hydrates full history. An omitted title uses the first nonempty prompt line with leading Markdown heading, quote or list markers stripped, capped at 120 characters (ARC task when there is no text). Seed failures archive on the creating App Server before it exits; later definite creation failures archive only when the turn list is confirmed empty. MCP receipts expose `failureStage` and `cleanup`, including any archive error; stored local receipts also retain `seedTimings` in milliseconds. Unknown submissions remain available for inspection. Reads and waits do not resume execution. `executionOwner` is `desktop` or `connector`; Linux uses the latter.


Send receipts include `dispatchMode: "steered" | "new-turn" | "queued"`. The default `sendMode:"auto"` preserves steering. `sendMode:"queue"` accepts a durable FIFO message and returns `queueId`; receipt completion means queue acceptance, not execution. Query `codex_queue({threadId?,queueId?})` for up to 100 newest entries and the total; dispatch remains oldest first per thread. Entries expose `queued`, `blocked`, `dispatching`, `sent`, `failed`, or `cancelled`, with a short preview and the dispatch request/turn IDs. Queue operations are source-scoped. Older explicit tool allowlists must enable the new ops.

```json
{"op":"codex_send","args":{"threadId":"<thread>","prompt":"Next step","sendMode":"queue"}}
{"op":"codex_queue","args":{"threadId":"<thread>"}}
{"op":"codex_queue_control","args":{"threadId":"<thread>","queueId":"<queue UUID>","action":"cancel"}}
{"op":"codex_queue_control","args":{"threadId":"<thread>","action":"resume"}}
```

An active turn or unanswered interaction keeps the queue waiting. A failed/interrupted predecessor pauses the queue. Capacity recovery takes priority; a successful retry lets the queue continue. `resume` explicitly accepts the failed predecessor; omit queueId to resume/cancel all undispatched entries in that thread. Already-submitting messages cannot be recalled. ARC rechecks the previous turn immediately before starting; a concurrent thread change or uncertain submission becomes a failed queue entry for inspection, never a steer or blind replay. Queue entries and dispatch reservations survive restart.

Automatic capacity continuation uses the same thread and confirmed model, preserving history and asking the Agent to verify previous work before continuing. It never resends the original task input or replays stored tool calls. It is restricted to native `codexErrorInfo:"serverOverloaded"` failures whose complete failed-turn history contains only user messages, Agent messages or reasoning. Any tool activity, unknown history/model, other error or uncertain write excludes automatic recovery. This conservative check does not promise exactly-once external effects; ambiguous effects require review. Intermediate failures are withheld from notifications; exhaustion emits one failed event with the retry count. Read/wait results include retry status, deadline and successorTurnId when applicable. `task-settings.codexRetryMaxAttempts` defaults to 3 (0 disables, range 0–10); `codexRetryInitialSeconds` defaults to 30 (1–3600). Delays double per attempt and cap at one hour. Existing terminal failures are not retried retroactively.

For validation tasks use `purpose:"self-test"`, which defaults to `notify:null`. Explicit `notify:null` is also recommended. Never copy the orchestrator's target into a self-test; an explicitly supplied destination must be a dedicated test target.

codex_tasks defaults to view:compact: title, threadId, project, status, updatedAt (Unix seconds), currentTurn and model/modelSource, without prompt previews. view:full preserves the previous fields and full native preview, with the same status enrichment and per-request dispatches history. Pagination and filters are unchanged. Reads never resume tasks; live enrichment has an eight-second page budget. status is running, idle, needs-input, failed, retrying, queued or unconfirmed with a specific statusReason. Priority is needs-input, retrying, running, failed, queued, idle; queue counts remain visible alongside an active/failed state. Persisted-only, contradictory or unavailable runtime evidence stays unconfirmed; currentTurn is the latest observed turn, not proof it is running; source:persisted-history retains history evidence if live checks fail. Missing models are null with modelSource:not-reported-by-owner. Existing consumers needing preview/configuration/actions must explicitly request view:full.

`codex_changes` compares the current worktree with the HEAD/dirty baseline captured before the turn. It includes current untracked files and pre-existing dirty changes. It returns reachable new commits and file statistics; path selects a paged diff. Missing historical baselines use fallback=true with recent commits and the current diff. The result is a live workspace comparison, not a frozen task-only snapshot.

Codex completed events retain a persisted change snapshot captured when completion is observed (five-second collection budget). The pushed receipt omits it. Use codex_changes to inspect commits and file statistics; this query is live and paginated. Changes may include other tasks and pre-existing dirty files, so attribution is never exclusive. An answered asynchronous question's original turn does not emit an empty completed event; a substantive result or the continuation still emits normally. Other completion events are retained.

## Receipts and interactions

Control-source responses omit ARC `origin` attribution from receipts and task metadata by default. ARC retains it in durable receipts and internal records. Existing callers that need public attribution can request `receipt` with `includeOrigin:true`; credentials and private authentication material remain excluded. Management activity views retain source identity.

Ops that support receipts accept a UUID requestId, generated when omitted. Usually omit it and retain the returned ID. Supply a UUID before the first write when retries must survive a lost response. Supply it at act’s outer level or in args; the outer value takes precedence. For receipt it identifies the original operation. Ops without a requestId property (including connector_verify and screen) reject it; omit it for those ops. Retain it for retries: the same ID and arguments return the original receipt; changed arguments conflict. The default dispatch wait is 25 seconds, adjustable with waitMs from 0 to 120000. A longer dispatch returns pending. `receipt` reads the original operation or applies approve/bypass/reject to a pending ARC task approval.

The guide index and per-op guide return `retry.mode`: `read-only`, `receipt`, `original-receipt`, or `read-back`. `receipt` accepts an omitted requestId and returns a server-generated UUID. Retain that UUID and identical arguments for retries, with `waitMs` allowed to change. `original-receipt` identifies an existing operation; read it before repeating an approval decision. `read-back` provides no ARC receipt protection: inspect current state or the upstream result before repeating a side effect. In particular, `context_amend`, `screen`, notification controls, and queue controls do not gain receipt protection from act's outer requestId. Omitted IDs remain supported for one-off writes, but a lost generated ID cannot be recovered by blindly repeating the write.

With `includeOrigin:true`, public receipt reads expose recorded `origin` fields: `ingressId`, `sourceId`, `sourceLabel`, `controlSource` (source product), and `authType`. The projection includes only these string fields; it never exposes credential anchors, principals, or tokens. Legacy unattributed records do not gain inferred provenance.

Receipt completion describes the operation; task completion comes from read/wait. An unconfirmed outcome needs readback using the original request/task IDs. Do not resend it with a new ID.

`codex_pending({threadId?})` returns native requests and unanswered Desktop questions with `respondToken`, `respondTokenExpiresAt` (Unix seconds), `responseId`, `backendSession`, `method`, `params`, `canRespond` and `next`. Specifying a thread refreshes its Desktop state. Prefer `codex_respond({respondToken,result})`; legacy `{id:responseId,backendSession,result}` remains supported. Tokens bind to one ingress, thread, turn and interaction; they expire after 24 hours and are consumed after a successful answer. An optional threadId assertion rejects a mismatched thread. Do not combine a token with legacy id/backendSession. Refresh pending after expiry. Persisted Desktop tokens survive ARC restart after fresh owner validation; native app-server callbacks remain session-bound. Desktop asynchronous questions use `result: {answer: "option or free text"}`; command/file approvals use `result: {decision: "accept" | "decline" | "cancel"}`. Permissions, synchronous user input and MCP elicitation use their native response schemas (`codex_schema`, `direction: "server"`). ARC-owned app-server requests accept exactly one of result/error. Desktop responses require result and are confirmed by owner readback. Requests with `canRespond: false`, including user verification and unsupported pickers, require Desktop. Saved Desktop notification callbacks are revalidated against the live owner after restart; otherwise refresh pending for the current backendSession; answered requests disappear. An unconfirmed response must be inspected before retrying. ARC task approval is separate from Codex command permissions.

Dispatch receipts include only deliveries queued since that operation began; explicit read/wait calls retain the full turn notification history.

## Waiting

When delivery is unverified, failed or unbound, do not rely on proactive notifications. If the controller can schedule a later return to the same conversation, use the receipt's `next.revisitAfterMinutes`: the matching Agent/model/reasoning configuration's `history.medianObservedDurationMs`, rounded up to whole minutes (at least one). The field is omitted without an unambiguous matching sample group; ARC does not schedule the revisit. Only short tasks should use segmented waits within the active turn. Dispatch receipts supply executable `codex_wait` / `agent_wait` arguments with task/turn IDs, `until:"terminal"` and `timeoutMs:30000`. All three waits default to 30000 ms; the server maximum is 1800000 ms, capped at 170000 ms for Claude.

`inbox_wait({timeoutMs?, threadIds?, taskIds?, eventTypes?, target?})` waits for unread events visible to the current ingress. Existing matching events return immediately as `{state:"events", events, unread, elapsedMs}`. The events have the same fields as `arcInbox`; at most five are returned and `unread` counts matching unread events. `threadIds` and `taskIds` are an OR filter; `eventTypes` additionally filters `kind` (`completed`, `failed`, `interrupted`, `needs-input`). Omitted filters match all visible events. Lists must be nonempty and contain at most fifty unique entries. Timeout returns `{state:"timeout", events:[], unread:0, elapsedMs, next:{via:"query",op:"inbox_wait",args,...}}`. Follow `next` unchanged. After a disconnect, repeat the same filters with a new MCP request ID; there is no cursor to lose.

Polling does not mark an event attached or read, so it repeats until `notification_ack` or a successful read of the corresponding turn acknowledges it. Deduplicate by `eventId` and acknowledge only after handling it. It does not create a task, bind a notification target, or change delivery. Claude must provide its own cloud session ID/link as `target`; only matching already-bound events are visible. Existing active MCP subscriptions retain callback ownership and are not exposed through a shared inbox. Use `codex_wait` / `agent_wait` when those visibility rules prevent inbox polling or when waiting for a specific task's full result. Use `until:"terminal"` for task waits.

Wait responses begin streaming immediately, then send a heartbeat about every thirty seconds. With `Accept: application/json, text/event-stream`, ARC emits SSE comments; a string/number `params._meta.progressToken` instead enables MCP `notifications/progress` with that token. JSON-only clients receive legal leading JSON whitespace. The final JSON-RPC response is unchanged. The stdio bridge forwards negotiated progress and the final reply, discarding SSE comments. Without a progress token, stdio has no unsolicited MCP heartbeat. Responses request `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`; proxies still have to allow streaming. Disconnect, response-body drop, or stdio EOF cancels the wait and releases its request registration, without cancelling the task or acknowledging inbox events.

ARC HTTP/HTTPS listeners have request-header/body deadlines but no response deadline. The stdio bridge allows 1830 seconds for wait requests. ARC starts its managed official Tunnel Client with `--mcp.connection-max-ttl 31m`; the client's default ten-minute forwarding TTL would otherwise stop long results even with progress. This takes effect when that managed connection next starts. The OpenAI control plane can still supply a separate `response_timeout`; ARC cannot override it. See the [official protocol](https://github.com/openai/tunnel-client/blob/v0.0.16/docs/protocol.md). Heartbeats address idle timeouts, not hard total deadlines.

For `codex_wait`, `agent_wait` and `inbox_wait`, Claude control sources cap each wait at 170000 ms, reserving ten seconds before the 180-second client hard deadline; transport heartbeats cannot extend it. Other sources retain the 1800000 ms maximum because no lower client deadline is established. The source metadata owns this cap. Requests above it execute with the cap and return `waitLimit` with requested/effective budgets and a continuation hint. Long tasks use multiple waits with `expectedHash`; `next.args` preserves the supplied `until` and effective `timeoutMs`. Nonterminal snapshots without an interaction return only the latest confirmed completed agent message; without one, no body is returned. Pi uses `message_end`; ACP chunks alone do not establish message completion.

After timeout, keep the same task/thread and turn IDs and pass the previous snapshotHash as expectedHash. Treat `snapshotHash` as an opaque token and return it unchanged. It controls `changed` reporting, not whether a terminal result is returned. When `expectedHash` is supplied, nonterminal responses omit repeated `finalResponse` text if the snapshot or its `textHash` is unchanged and set `finalResponseUnchanged:true`. Object responses retain their metadata (including nested `textHash`) but omit `text`; string responses omit `finalResponse`. The top-level `textHash`, state, snapshot hash, timestamps and continuation metadata remain available. Without `expectedHash`, bodies are retained. Completed, failed, cancelled and interaction-required results always retain their bodies, including existing pagination/truncation metadata. Cancellation/disconnection of a wait ends that wait, not the task. Results distinguish completed, failed, cancelled, interaction-required, timeout, and unconfirmed. Read `finalResponse` when present and the observation timestamps. Each native read has a separate ten-second budget and can be retried throughout the wait. Exhausting the wait budget during a read does not invalidate the last successful observation; actual unresolved read failures still return `unconfirmed` at the deadline.

### Measured transport envelope

These are completed probe durations or observed failures, not claimed maximum lifetimes. The probe used an isolated ARC core, the installed tunnel binaries and no dispatched task or external notification target. A buffering test proxy withheld every upstream byte in the no-heartbeat group.

| Path | With heartbeat | Without heartbeat | Scope |
| --- | --- | --- | --- |
| ARC local HTTP → Node fetch | JSON whitespace: 600.032 s; SSE progress: 600.028 s, both final `timeout`; largest gap 30.003 s | Client failed at 300.972 s with `UND_ERR_HEADERS_TIMEOUT` | The failure is the probe client's header deadline, not an ARC response limit |
| Cloudflare Quick Tunnel → isolated ARC HTTP | SSE comments: 600.884 s, final `timeout`; largest gap 30.233 s | HTTP 524 at 125.701 s | Same installed cloudflared binary/provider, temporary HTTP/2 tunnel; configured named production route not measured |
| Official Tunnel Client 0.0.16 → ARC stdio, TTL 31m | 660.026 s, 23 progress notifications, final `timeout` | 660.027 s, no progress notifications, final `timeout` | Real installed client against a local mock control plane; exceeds its old ten-minute default, not a cloud gateway measurement |
| OpenAI cloud control plane / gateway | Not measured | Not measured | Local mock control-plane results cannot establish its `response_timeout` |
| Claude / ChatGPT clients | Not measured | Not measured | Use the controller procedure below; HTTP heartbeats do not establish the client's total deadline |

Transport measurements do not establish a controller deadline. Use the source-specific `guide` and `next.args`; Claude calls are capped at 170000 ms. Other sources retain the 30000 ms default and 1800000 ms server maximum; shorten waits for the client deadline.

### Checking a controller's wait deadline

Claude and ChatGPT client-side total request limits have not been measured by ARC's transport probe. Test the actual controller session before using nine-minute waits:

1. Refresh `guide`, then request `inbox_wait` with a nonexistent test task ID, for example `threadIds:["self-test-no-events"]`, initially for 30000 ms. This needs no task or notification target. Try 120000, 540000, then larger budgets up to 1800000 only after the preceding request returns normally. On Claude, supply the current session as `target` for visibility; this read parameter does not bind or send notifications.
2. Observe wall time, the final `state:"timeout"`, and any disconnect/error. A response ending early is not proof that the full requested budget worked. Record the transport, controller, progress-token support and longest completed budget. A successful duration is a lower bound, not the maximum.
3. For a raw HTTP probe, accept both JSON and SSE and record received chunk gaps. Test with a `progressToken` and without it (SSE comments), then compare a deliberately buffering test proxy that withholds all heartbeat bytes. Use an isolated ingress; do not disable streaming on a production proxy.
4. For event latency, create a dedicated delayed task with `purpose:"self-test"` and `notify:null`, then wait only for its task/thread ID. Do not reuse another chat's notification target. Claude's unbound self-test task is not visible in its session-scoped inbox; use task wait for that case. Handle the returned event before `notification_ack` and verify that the same filter is empty afterward.
5. Interrupt the waiting request, reconnect with the same filters (or the task/turn IDs and last `expectedHash`), and confirm no task was dispatched again. Choose a budget below the shortest measured client/proxy deadline, leaving response overhead; a client that disconnects early must use shorter waits even when ARC accepts 1800000 ms.

## Control-source notifications

`codex_create` and `codex_send` accept `notify: {channel: "claude-session", target: "…"}`. The target is a `session_` / `cse_` prefix followed by exactly 24 ASCII letters/digits, or a `claude.ai/code/<id>` URL containing that complete cloud ID. ARC rejects malformed IDs before binding or sending with `INVALID_CLAUDE_SESSION`, `argument:target`, the expected format, and a structured recovery step. Copy the ID from the receiving cloud conversation; local Claude CLI UUIDs are not cloud-session IDs. `agent_create` and `agent_send` accept the same binding. ChatGPT Work uses independent MCP Events subscriptions; no per-turn notify target is needed. Ordinary Chat cannot be proactively woken; use inbox_wait during the active turn. Omission retains a same-turn binding; null unbinds. New turns should bind explicitly. A native Codex retry immediately after a failed/interrupted ARC turn inherits the binding only without an explicit binding/unbinding record. Both start and detection must be within ten minutes of the native terminal timestamp. ARC requires a persisted capacity_retry_automatic, capacity_retry_manual or resume_interrupted_task trigger, no new user message in history or the owner snapshot, and persisted turn configuration. Missing/unknown evidence and Desktop user-authored turns do not inherit. Accepted retries are recorded as dispatchSource:native-retry with retryOf, nativeTrigger and native model/effort/serviceTier; they retain purpose, support codex_review and enter history. Their stable record requestId is the native turn ID, not a replayable ARC request receipt. In-flight ARC retries first resolve their existing receipt. Once adopted, a retry is observed to completion even past the window.

Control sources select a Claude profile per source and cloud-session target with `notify_control({action:"route",target,accountId})`. Omit `accountId` to list that owned target's route and safe available profiles (email, organization and plan). Only already bound targets are readable or writable. `bind` and `verify` also accept `accountId`. Changing a route invalidates the previous handshake. An unrouted bind probes session visibility without sending messages. Exactly one confirmed visible profile is saved automatically; zero, multiple or inconclusive matches return `ACCOUNT_SELECTION_REQUIRED`, safe `candidates` and a schema-valid `next`. Selection never logs in or changes the system account. Existing explicit host routes are preserved on migration. The local `accounts.route` operation and AX `account_notify({id,action:"bind",target})` manage host assignments. Public account IDs refer to provider identities; each account owns its CLI profiles. `account_add({kind:"detect"})` imports the current system Claude login into an isolated profile, reusing a matching signed-in profile. Credentials are never returned. Manual `accounts.send` or `account_notify({id,action:"send",target,message})` uses the same delivery transport and refuses a conflicting route. Background notifications and reachability checks resolve the saved route before starting an isolated CLI child. Unassigned targets require a uniquely visible or explicitly selected profile. Assigned missing profiles fail without trying another account. Source route edits affect only the calling source and target. For a normal Claude Chat, use its upstream `workspace_session_id`; the `/chat/<uuid>` URL alone does not identify a CLI target.

ARC observes completion, failure, cancellation, requests for input/approval, and writer handoffs. It calls the installed Claude CLI with `-p <fixed message> --cloud <session> --output-format json`. Delivery succeeds only for `ok: true` and the matching session_id. Pending and interrupted deliveries survive restart. Failed or uncertain sends retry with the same eventId, with exponential backoff starting at ten seconds and capped at five minutes; consumers deduplicate eventId. Read `notification` (channel, target, deliveries with eventId, kind, level, state and error) on the task; a binding failure marks the receipt bind-failed without failing an already-dispatched task. ARC escalates breaker and sustained token-starvation episodes through a local system notification. See the [workflow guide](../guides/claude.md).

Each target has persisted `reachability: "verified" | "unverified" | "failed"` and a short `reason`, exposed in `notify_status` and bound dispatch receipts. New targets are unverified. Known delivery failures and unconfirmed handshake expiry mark failed; ordinary successful sends never mark verified. A subscription being active, a full bucket, or callback acceptance does not prove that the controller received a message.

Task receipts are automated notifications, not user messages. Claude text and MCP summary contain four plain-text lines: the fixed ARC automation marker; state, project basename, and known duration; the thread title (falling back to the original dispatch prompt first line, then project name) truncated to 100 characters; Agent, known model/effort/tier, and full thread/task ID as ref. Priority is displayed as Fast. Missing explicit titles use the first nonempty prompt line, truncated to 120 characters at creation and 100 in receipts. Unknown effective model/effort/tier values fall back to dispatch values; default tier and unknown values are omitted. Agent output, errors, question bodies, and raw dispatch JSON are never included. Batched deliveries contain one block per event. Use the full ref with codex_read or agent_read, and codex_pending or agent_pending for interactions. Query results retain the full payload. Event IDs remain in structured fields for deduplication and notification_ack; reading the corresponding turn also acknowledges its events.

For a new Claude target, call `notify_control({action:"bind",target,threadId?})` to bind and verify without dispatching work. For a bound or registered target, call `act({op:"notify_control",args:{action:"verify",target}})`. ARC sends a single-use code through the existing Claude CLI channel; within five minutes, the controller that received it calls `act({op:"notification_ack",args:{target,code}})`. Only that confirmation marks verified. The code is omitted from status/receipts, and acknowledgements are ingress-bound; invalid, expired or replayed codes fail. The handshake consumes one existing bucket token and honors the master switch and breaker. After validating the target and source ownership, verification checks the notification master switch before account-route selection or visibility probes. Disabled verification returns `NOTIFICATIONS_DISABLED` and preserves the binding; binding with `verify:false` and explicit route management remain available. Retry verification explicitly after failure. MCP Events retain their existing webhook challenge and delivery behavior; webhook acknowledgement is not a conversation handshake, so its target remains unverified. Only a verified and available Claude binding yields the dispatch hint to end the turn and wait; otherwise follow `next`.

`guide` is always available with topics `loop` (default), `notify`, `review` and `approvals`. It follows the ingress control source and app locale. Loop and notification text omit other sources; wait schemas/signatures use the source limit. Op index signatures derive enum choices and nonempty-string constraints from schemas (`tree/read view?:raw|review`, `search view?:raw|review|full`, `query(≥1 char)`). Dispatch without explicit permission parameters unless the user requests them in the current conversation.

Registered turns produce fixed `completed`, `failed`, `interrupted` or `needs-input` events. Tool results on the originating ingress carry `arcInbox` when unread events exist (at most five listed, fifty retained per ingress). A successful `codex_read`, `codex_wait`, `codex_items`, `codex_changes`, `agent_read` or `agent_wait` marks the returned turn's existing events read. Unconfirmed waits do not acknowledge events. Array/scalar results always use `{value, arcVersion}`, with arcInbox when present.

All events use one scheduling path and token bucket per channel and target. Claude ordinary events merge until two quiet seconds have elapsed, with a maximum 30-second window for continuous arrivals; needs-input and approval notifications bypass only this window. MCP callbacks send one event per request without this window. Each batch containing new events costs one token. Failed or unconfirmed retries reuse event IDs and cost no additional token; their backoff is 10, 20, 40, 80, then 160 seconds, with at most six attempts. Empty buckets retain and combine queued events until refill, with a merged-count line in the message. Claude-session notifications use plain event blocks with full IDs. `respond={op,args}` supplies the callback; add the required `result` and call act directly. Async questions use `{answer:"..."}`; synchronous multi-question requests require one combined `answers` map with every question ID. Approval content and available decisions are preserved. Only stale or missing callbacks require a pending query. Saved Desktop callbacks for the current source can survive an ARC restart; the live owner revalidates the exact request before responding. App-server callbacks remain session-bound. Completed events include the last message verbatim, capped at 2000 Unicode characters; `truncated=yes` includes a full-text query. Failed/interrupted events include the original error when supplied by the owner. No task state or result is inferred from the notification delivery status.

For Claude sources, arcInbox includes only events matching the current call's explicit `notify.target` (normalized session ID or URL). Calls without a known target omit automatic inbox events. Matching events attach only once; delivered/resolved events are omitted. Attachment is separate from read status. For an authenticated MCP principal with an active event subscription, automatic inbox attachments are omitted; events use their subscribed callbacks. ChatGPT and other sources without such subscriptions retain unread reminders because no per-chat target is available. `act({op:"notification_ack",args:{eventIds:["..."]}})` marks selected events read; `args:{all:true}` marks the current source inbox read. The result distinguishes `markedRead` (new acknowledgements), `alreadyRead` (previously read, delivered, digested or resolved), and `notFound` plus `notFoundEventIds`; repeated IDs are counted once. Delivery is treated as consumed for acknowledgement even when its inbox row has aged out. This source-scoped, idempotent operation is always available and never answers or cancels a task. Reading the corresponding turn also marks its existing events read. No events means no `arcInbox` field.

Desktop IPC state changes wake observation, with a two-second fallback refresh. Deliveries survive restart; resolved interactions are not sent again. The bucket defaults to ten tokens and refills one every sixty seconds. `task-settings.notificationBucketCapacity` (1–1000) and `notificationRefillSeconds` (1–86400) configure it; `notificationsEnabled` remains the master switch. The removed `notificationWakeLimit` is migrated once: the old default becomes capacity 10, a custom positive value becomes capacity (capped at 1000), and zero disables the existing master switch. The old key is removed and rejected on subsequent writes. The refill default is always 60 seconds. Existing attempted deliveries retain retry credit; recent recorded batches remain visible without becoming new bucket debt.

Health and throttling diagnostics remain in notify_status rather than pushed receipts. `causedBy` records the dispatch op, time and requestId on the binding. Missing provenance is omitted, never reconstructed by guessing. Inbox events carry their current `target`. Claude attachments match the supplied target; other entrances without a session target retain the ownership notice. An ingress may be shared by multiple Claude sessions; its identity alone does not identify the calling session.

`act({op:"codex_resume",args:{threadId,turnId,requestId?}})` resumes the latest interrupted ARC-bound turn with native empty input. It keeps the original dispatch source and notification binding. The task panel exposes the same action. A live Desktop owner receives a follower request; ARC never takes its lock. An unheld writer can be acquired by the connector through native resume. Reuse the receipt requestId after uncertainty; a different request against an advanced predecessor is rejected.

Interrupted continuations use an open thread+origin scope, including the user clicking Resume in Desktop. Archive, source unbind (`notify_control` rebind with target:null), or a new unrelated dispatch/content ends that scope. A same-origin ARC send with omitted notify continues it. An explicit notify override (including null) or a different origin establishes a new dispatch scope; new Desktop user content never inherits. Ordinary new user text does not inherit. Recognized native environment scaffolding is not new task content. Explicit local replacement continuations and interaction replies retain their bindings. Capacity retries keep their ten-minute native start window; interrupted resumes can be recognized after arbitrary downtime while their scope remains open. Each bound turn still has one stable terminal event and independent delivery status.

A control source represents the user's intent. It MAY send to a Desktop-owned thread without another confirmation. ARC routes send/steer/queue/next, answers, approvals, and interrupts through Desktop follower/IPC and keeps observing notifications. Restart releases the connector writer; ARC does not reclaim it after Desktop takes control. `THREAD_WRITER_BUSY` applies only when ARC cannot route to the actual writer. A genuinely unavailable Desktop route returns an actionable Desktop error. A connector callback that disappeared during restart returns `STALE_INTERACTION` with `next` pointing to `codex_pending`; never apply an old approval to a different Desktop request.

Ownership and observed handoffs are exposed by `codex_owner`, `task_timeline`, task details, and notification diagnostics. Running tasks and tasks with pending interactions produce source-scoped handoff inbox/notification events with stable IDs across successor turns. Terminal tasks without pending interactions retain handoff history in ownership reads and `notify_status` without individual wakeups. This preserves the frozen `notification` subscription envelope and uses the existing delivery governance.

`query notify_status({target?,threadId?,all?})` returns source-scoped target buckets, pending/sending events, batch kind counts over the preceding hour, thread wake rankings, thread/turn bindings, and the last successful delivery or acknowledgement time. By default, targets are included when reachability is unverified/failed or they have batches in the last hour, pending/sending events, an enabled breaker, non-null emptySince, or escalated state. Threads are included only with last-hour delivery attempts, pending/sending events, or a non-normal mode; each includes only its latest turn with causedBy. `all:true` returns all records and historical turns. Supplying target or threadId also disables omission within that scope. `summary` contains scope totals `totalTargets`, `totalThreads`, `totalBindings`, and `hidden` counts for targets, threads and bindings (omitted turn records). All status timestamps are Unix seconds except the nested delivery `timing` fields, which use milliseconds. Older records without exact completion or acknowledgement times return null. Each thread/turn includes `diagnosis` with scope state, successor inheritance, last observation/error, reasons for missing delivery, and a schema-valid `next`. Reasons distinguish pending restart reconciliation, Desktop ownership, superseded/inherited turns, excluded successors, closed scopes, and queued delivery. Thread ownership includes the last observed owner and handoff history. Cached observation time remains explicit; `codex_owner` refreshes it. `notify_status` is always available. `notify_control` is a normal write op in the common preset; existing custom policies must explicitly enable it.

```json
{"op":"notify_control","args":{"action":"mute","threadId":"<thread>","until":"2026-12-01T10:00:00Z"}}
{"op":"notify_control","args":{"action":"mute","threadId":"<thread>","mode":"digest"}}
{"op":"notify_control","args":{"action":"unmute","threadId":"<thread>"}}
{"op":"notify_control","args":{"action":"rebind","threadId":"<thread>","target":"<session>"}}
{"op":"notify_control","args":{"action":"rebind","threadId":"<thread>","target":null}}
{"op":"notify_control","args":{"action":"breaker","target":"<session>","enabled":true}}
```

Controls persist across restart and apply to future turns of the thread. Mute retains events without waking the target. Digest sends hourly compact event batches for Claude, or releases individual MCP events at the hourly window, and keeps the original events in the inbox; those summaries use tokens too. Expiry or unmute resumes normal delivery. Rebind updates the thread's pending Claude events and future binding; null unbinds it. Rebind back to the previous target to undo it. Breaker blocks target wakes until set to false. These operations never answer, cancel or recreate an Agent task. A send already started cannot be recalled.

When notification status looks unusual, inspect `notify_status` first. If the Agent is looping, use `codex_send` to ask it to combine questions or decide within its existing authority. Use mute, rebind or breaker as appropriate. If unresolved, involve the user. ARC attempts one local system notification when a breaker is enabled, or when a bucket remains empty with queued events for `notificationEscalationSeconds` (default 900; configurable 1–86400). The notification includes the target, threads and count. Recovery resets the episode. An unavailable desktop or missing system-notification permission is recorded as `escalationError`; an attempted notification does not prove the user saw it. Individual send failures are recorded and retried, without separate system-notification spam on each retry.

Delivery details appear only on dispatch receipts and in notify_status; review and other non-dispatch receipts omit them. Each delivery exposes `timing`: `queuedAt`, `startedAt` and `finishedAt` are Unix milliseconds; `queueMs` measures elapsed time from event creation to the latest attempt (including earlier retries), and `sendMs` measures that attempt. `queueReason` retains the last blocking reason: `batch-window`, `token-wait`, `disabled`, `retry-backoff`, `muted`, `digest-wait` or `breaker`; unsupported or unbound targets record their own reason. Local logs contain timing and identifiers without message content. Missing timestamps on older records are unknown. These times do not measure receiver display. Unfinished tasks and pending deliveries are retained; finished records expire after seven days.

## Host and native operations

| Op | Operations |
| --- | --- |
| command | Simple cmd/cwd execution, or native exec/write/terminate/resize |
| process | spawn, writeStdin, kill, resizePty |
| fs | writeFile, createDirectory, remove, copy, watch, unwatch |
| mcp | list, resource/read, tool/call, oauth/login, event/stream/start/stop |
| codex_account | read, usage/read, rateLimits/read, workspaceMessages/read |
| codex_schema | Native domain/method schema discovery |
| codex_query / codex_call | Native read/mutation methods subject to task ownership |
| screen | macOS window capture and accessibility operations; OS permissions apply |

Simple `act {"op":"command","args":{"cmd":"git status --short","project":"my-project","timeoutMs":10000}}` uses the user's shell and returns stdout, stderr, exitCode, and durationMs. It defaults to a 60-second execution timeout. Optional `waitMs` (0–120000) bounds only the wait for the receipt and can return `pending`; continue with `receipt` and the returned requestId. Without waitMs, the simple form waits for the execution timeout plus ten seconds. Simple fields and action/params are mutually exclusive. `command` and `agent_create` accept `project` instead of absolute `cwd`. Multi-root projects require `root` for this new form. Absolute `cwd` takes precedence when both are supplied. Native `command` exec, `process` spawn, and `codex_thread` fork also accept top-level `project`/`root` instead of `params.cwd`; existing `params.cwd` takes precedence. Project lookup happens inside ARC, so callers need no preliminary `projects` query. Native command/exec uses the upstream sandbox/permission policy; process/spawn runs directly on the host outside the Codex sandbox. Neither creates a thread.

The command executor terminates its process tree/group when execution returns. `nohup`, background subshells, and double-forking are not supported ways to keep work alive beyond that lifecycle. A pending receipt changes how long the caller waits, not process ownership. For ARC self-replacement, invoke the supported local `cli app replace` entry point as the turn's final command. Its native launchd worker owns the handoff independently of the command runner. See [Local app replacement](app-replacement.md).

Native handles for processes, watches, and MCP subscriptions belong to the current App Server connection. MCP tool/call and event/stream/start require an existing threadId. Consult codex_schema before using native parameters; top-level RPC timeoutMs is separate from params.timeoutMs.

## Output, events, and logs

Large JSON results over 64 KiB are stored as snapshots with outputId and nextOffset. `control_output` reads up to 65536 UTF-16 code units per page; join all text pages before parsing JSON. Snapshots expire after one hour and share a 64 MiB quota. Expired reads return OUTPUT_EXPIRED; oversized/unallocatable snapshots return OUTPUT_STORAGE_LIMIT.

Codex events keep a bounded memory window of 2000 entries or 8 MiB. gap/reset reports loss or restart. Native task history remains readable on demand. In `task_timeline`, a silent command has empty `output.text`; missing or null native output is never rendered as the text `null`. Commands that actually print `null` retain that text. Pi/ACP events additionally have durable archives; see [Agents](agents.md). `codex_read` and `codex_items` default to compact structured items: agentMessage, userMessage, fileChange, error, and commandExecution (command, exitCode and bounded output). Reasoning and other internal items are omitted. Truncated bodies carry `truncated:true` and a shared readMore hint. `view:"full"` retains original item IDs, text hashes, text offsets and configuration/action metadata where available. In codex_items, text continuation with offset/expectedHash requires full view; native page cursors and turn IDs are preserved in both views. `codex_read` can include local images with includeImages and maxImages.

`logs` reads retained Core and connected App Server stderr logs newest first. since uses RFC3339, level is exact, grep is a fixed string, and cursor continues a page. Retention is seven days and 16 MiB; an expired cursor reports gap.

## Review views and task context

For overview/tree/search/read/git, explicit `view: "review"` resolves the real workspace boundary and excludes paths outside it and ARC's own runtime state. In-root symlinks remain readable; Git renames check both paths. Default reads follow host permissions without content-based filtering.

With includeSource, coverage records pagination, filtering, and skipped items. A non-null read.nextLine requires another page even if truncated is false. Search snippets cap per-file matches/characters; matchesComplete reports their completeness. Use read for the full text. tree/search can pass listingHash as expectedHash; read uses sha256. A changed hash requires restarting pagination. A listing hash does not freeze file contents.

`query {"op":"agent_context","args":{"agent":"pi","taskId":"<existing ID>","view":"handoff"}}` reads an existing non-Codex task plus current project facts. Optional project must match the task workspace or TASK_WORKSPACE_MISMATCH is returned. Missing evidence is partial. Policy checks include agent_read and git; readNext recommends allowed ops with via/op/args. Codex review uses codex_read/items/changes directly.

## Git mutations

`git` and `git_write` accept `action` as an alias for `operation`; supplying both requires equal values. Aliases normalize before receipt hashing, so retrying with the other spelling retains the same receipt. `git_write` uses project, operation/action, and an optional UUID requestId:

| Operation | Input / scope |
| --- | --- |
| add / unstage | Nonempty literal relative paths or all=true, exclusively; unstage changes only the index |
| commit | Required message; commits the current index, without amend |
| branch | Required branch; creates a local branch from HEAD |
| switch | Existing local branch, or create=true to create and switch |
| stash_push | Tracked changes only; optional message |
| stash_pop | Latest stash; Git preserves stash/conflict state on failure |

Branch, commit, and stash operate on the repository. There is no fetch/pull/push, branch deletion, history rewrite, hard reset, or clean operation. Git writes run under host permissions, outside task-creation approval. Use receipt and git readback after failure or an uncertain result.

Commit/stash identity comes from repository/global user.name and user.email, including include/includeIf; missing identity fails. Process GIT_AUTHOR/GIT_COMMITTER overrides are not used. Hooks, fsmonitor, external diff, configured filters, signing, automatic maintenance, and recursive submodule operations are disabled. Files requiring filters such as LFS are not converted automatically. stash_pop disables rerere and rejects external merge drivers. Commands use a 12-second timeout and 16 MiB per output stream.

## Images and item pagination

read detects PNG/JPEG/WebP/GIF by signature and returns MCP image blocks with source, original/returned dimensions, byte counts, hashes, and reencoded. maxEdge defaults to 1568 (1–4096); quality defaults to 80 (1–100). Originals within the pixel and 1 MiB byte limits pass through. Re-encoding uses JPEG for JPEG/opaque WebP, PNG otherwise; animation reduces to the first frame. A smaller original may be retained within the byte cap and less than 10% above maxEdge. Input reads retain the 16 MiB file limit.

codex_read and codex_items accept includeImages=false and maxImages=4 (1–8). Local Markdown images must resolve inside the task project or its own CODEX_HOME/visualizations/YYYY/MM/DD/threadId directory; symlinks cannot escape. Embedded data-URL tool screenshots are supported. An unavailable image adds an explanation while preserving the text result.

codex_items defaults to original oldest-first order. latest=true selects the newest turn and reads newest first; explicit turnId pins a specific turn. Continue with that turnId, nextCursor as cursor, and latest=true. A cursor with latest=true but no turnId is rejected. Desktop cursors bind to the read operation, threadId and selection (turnId/latest for codex_items). Keep them unchanged when continuing; if the read owner or selection changes, omit cursor and restart pagination. `order` is not supported; use `latest:true` for newest-first items, optionally pinned with turnId.

## macOS screen operations

Core invokes the bundled arc-screen Swift helper directly. Grant ARC Screen Recording and Accessibility in macOS settings when requested. Except for windows, select app (name substring), bundleId (exact), title (substring), or windowId; combined filters all apply. Refine ambiguous targets.

| Action | Result |
| --- | --- |
| windows | IDs, app/bundle/PID, titles, frames, visibility and foreground state |
| capture | Window image and metadata; maxEdge/quality follow image preparation |
| tree | Accessibility refs, roles, labels, frames; text=true includes static text; default 300, maximum 1000 entries |
| press | AXPress by ref or label substring; nth is zero-based; visible center-click fallback when foreground use permits |
| show | AXScrollToVisible for the selected element |
| raise | Explicitly activate the app and raise its window |
| key | Escape/Return/Tab/arrows, letters/digits, or combinations such as cmd+k |

Read a fresh tree after structural changes; refs are window-scoped structural paths. front=auto temporarily activates/restores an inactive target only after 60 seconds without user input. Otherwise capture may report possiblyStale and foreground-dependent input returns FOREGROUND_REQUIRED. never avoids activation; always temporarily activates and restores the previous app regardless of user activity. raise is an explicit foreground action.

press/show/raise/key can add `after: {"waitMs":200,"capture":true}` or a capture options object. Maximum wait is 10000 ms. Operation, wait, and capture share one Core lock even if the caller disconnects. If the action succeeds but capture fails, performed=true and captureError preserve the outcome; inspect before repeating the action. performed confirms input submission, so verify the visible result.

## Limits

Op allowlists do not isolate users/tasks or change OS permissions. Native method availability, login, and Agent capabilities come from the actual host. Screen operations are macOS-only; Linux has no Desktop actions. Event buffers are not durable task history; consume pagination before its retention expires.

## macOS permissions

| Ops | Permission / execution owner |
| --- | --- |
| screen tree, press, show, key, raise | Accessibility / arc-screen |
| screen capture, windows titles | Screen recording / arc-screen |
| read, tree, search, edit, write, git | Full Disk Access for protected locations / Core |
| command | Full Disk Access when cwd is protected / Codex app-server execution host |
| Closed-loop notification fallback | Notifications / ARC Desktop |

Missing screen permission returns `PERMISSION_REQUIRED`, `permissionId` and local settings guidance without prompting. File protection uses an FDA heuristic; unknown is not granted. command requires a successful executor FDA probe only when cwd is in a protected location. Screen-recording grants may require reopening ARC.

For the bundled Desktop launch chain, grant Full Disk Access to ARC App: Core and its Codex app-server children inherit that responsible application. A standalone Core launched by a terminal can instead inherit that terminal's identity; its probe does not prove the App is ready.

Paths referenced in command arguments are not inspected; enabling Full Disk Access can prevent permission dialogs during calls.

## MCP Events

The same authenticated endpoint supports `server/discover` for MCP 2.0 (`2026-07-28`), advertising `tools` and `events`. Legacy `initialize` retains the requested supported 2024/2025 protocol and tools-only capabilities. The three tool schemas are unchanged.

`events/list` exposes exactly one frozen event, `notification`, with frozen subscription arguments `{op, args}`. `guide` (topic `notify`) returns the event op catalog and argument schemas. Currently only `op: "task_status"` is supported; its `args` accepts optional nonempty string `threadId` and `taskId` filters (both must match if supplied). Empty `args` means all tasks dispatched through this source. Unknown ops and invalid arguments return JSON-RPC -32602 with a correction contract and guide reference. Kinds are `completed`, `failed`, `interrupted`, `needs-input`, `handoff`, and `recovered`. Payload ownership is null for task-state events and a declared object for handoffs, with eventId, from, to, observedAt, evidence and timeBasis. Its timestamp records observation time. Payload data contains op, kind, summary, project, title, agent, threadId, taskId, turnId and query. Nullable `reconciliation` declares endedAt, durationMs and timeBasis for restart reconciliation. Nullable `continuation` declares turnId and state for confirmed continuations. Nullable `recovery` declares recoveredAt and affectedTasks for one aggregated wakeup per verified destination with open bindings after restart. Existing buckets and delivery controls apply; pending recovery events coalesce rapid restarts. The signed envelope contains eventId, name, timezone-qualified timestamp and cursor:null.

`events/subscribe` accepts name, arguments, delivery:{mode:"webhook",url,secret}, optional ttlMs and cursor:null. Identity includes authenticated principal, source ID, URL, name and canonical arguments. Default and maximum TTL are 24 hours; positive ttlMs grants no more than requested, and null receives the finite default. Successful responses contain id, refreshBefore, cursor:null and truncated:false. Refresh rotates secrets with a five-minute dual-signature window. No historical replay is available.

Callbacks require HTTPS, public destination addresses at connection time, no redirects, and a `whsec_` signing key decoding to 24–64 bytes. Signed verification must return 2xx with the matching challenge. Failures return -32015 with data.reason. Successful verification is cached for at most five minutes for the same principal, callback and key.

`events/unsubscribe` accepts the original name, arguments and delivery:{mode:"webhook",url}; it is idempotent. Expiration, source revocation, ingress revocation or OAuth grant removal stops delivery. Only the owning principal can refresh or cancel a subscription. The notification master switch and thread mute apply; digest releases pending individual events at the thread’s hourly digest window, since each callback carries one event. `notify_control` breaker accepts an owned subscription ID; rebind applies only to Claude session bindings.

Events use the existing persisted source/channel/target token bucket. Each event pays once; transient failures retry with 10/20/40/80/160-second backoff, at most six attempts. 410 removes the subscription; 410/413 are never retried. Bodies are limited to 256 KiB. `notify_status` exposes unified `subscriptions`, `targets` and `deliveries` for Claude and MCP without callback URLs or keys. `callback-accepted` means HTTP receipt only, never model processing. Inbox read state is independent.

Claude notify bindings and MCP Events share the subscription model (target, channel, op and args), subscriptionId/eventId deduplication, token buckets, retry scheduler and delivery records. `notify_control` also accepts `subscriptionId` with `mute`/`unmute` (optional `until` on mute). Thread controls affect both channels; rebind only changes Claude destinations. A one-time migration retains Claude bindings, governance and delivery history, invalidates retired event subscriptions, and deletes the former storage. Recreate Work subscriptions with `notification` and `{op:"task_status",args:{}}`.

Work callbacks are asynchronous: a measured delivery took about 1.2 seconds, followed by roughly five minutes before model processing. No latency adjustment is exposed in the official tool or current task editor; users can manually choose Run now. Use this channel for long tasks, and segmented waits for tight loops.

## Inputs outside ARC

After an ARC dispatch, `codex_read` and `codex_wait` expose `externalUserInputs`, also included in completion notifications with short previews. Each entry identifies its turn, message or request, truncated text, and timestamp. `codex_read` includes per-turn entries and an aggregate for the returned turns; `codex_wait` selects its observed turn, including asynchronous replies linked to a question in that turn. ARC records its own submissions and responses locally, so these are excluded. Existing messages before the first tracked dispatch are excluded.

`kind` is `userMessage`, `interactionResponse` (native asynchronous question reply), or `interactionResolved`. Native timestamps are retained when available; otherwise `timeSource: "first-observed"` identifies an observation time, not a claimed send time. A request disappearing from a complete native snapshot records resolution only: `outcome: "unknown"` means the owner did not expose its answer or decision. Do not infer approval from it. Interactions that appear and resolve entirely between observations may not be available. Existing dispatches made before this tracking was installed have no provenance baseline.

## Source provenance

Authenticated calls resolve to a stable Core source before execution. Receipts and task reads expose `origin.sourceId`, `origin.sourceLabel`, `origin.ingressId`, `origin.controlSource` (the source product), and `origin.authType`. Labels are read from the source store, including revoked records. Product-specific wait limits use the authenticated source product even on shared relay connections. Source product and label corrections are local management operations; callers cannot choose their identity through tool arguments.

Notification bindings, subscriptions, inboxes, token buckets, notification controls, response tokens and dispatch queues use source IDs. Two OAuth grants on one connection are independent sources unless the owner explicitly reauthorizes an existing source at consent. Refresh rotation retains source identity. Grant revocation stops future delivery; existing task execution and shared task visibility remain unchanged. Migrated ingress-only history is attributed only when exactly one source exists on that ingress. Ambiguous history remains unattributed and cannot be claimed implicitly by a later caller.

The `guide`, `query`, and `act` parameter schemas and the single `notification` event's `{op,args}` input remain frozen. Source management is available only through the [local API and CLI](cli.md#control-source-management).


## Reducing repeated output

`codex_read` compact view defaults to the latest turn. Explicit `limit` and `cursor` request history; full view retains its two-turn default. Pagination still returns `nextCursor`.

Set `includeItemKeys:true` on compact `codex_read` or `codex_items` to receive `itemKey` on complete items. Pass those keys as `knownItemKeys` (maximum 100) to a later compact `codex_items` call. Unchanged complete items are omitted and counted in `omittedKnownItems`. Keys bind the native item content to its thread and turn. Changed items reappear. Truncated items receive no key, and full view cannot omit known compact items because it exposes additional metadata. Native data is still read to detect changes. Follow `nextCursor` even if every item in a page was omitted. Omission of these options preserves existing item responses.

`command` accepts optional `outputBudget` (0–65536) for the combined UTF-8 bytes of stdout and stderr in simple cmd or native exec responses. Exit status remains inline. When truncated, use `output.outputId` with `control_output` from offset zero to reconstruct JSON containing the complete streams. Snapshots use the existing one-hour/64 MiB output cache. The budget does not alter execution timeout, native output capture, or receipt idempotency. Without a budget, existing output behavior remains.

Dispatch receipt follow-ups retain `hint`, `via`, `op`, and `args`, with shorter hints. `next.hash` identifies the complete follow-up. Reuse it as `receipt.knownNextHash` to receive `next:{hash,unchanged:true}` while that follow-up is unchanged. Retain the previous full next object. A changed task, turn, notification workflow, or guidance returns full instructions. Without a known hash, every response retains full follow-up arguments.


Without verified proactive notifications, control sources SHOULD schedule a revisit timer using `receipt.next.revisitAfterMinutes` when provided. This historical estimate is absent when no matching duration samples exist. In-turn segmented waits SHOULD be limited to tasks expected to finish within a few minutes: each wait call costs the control source a full context round trip. Client wait limits still apply. Reuse the same task IDs and follow returned next arguments rather than redispatching.


## Outcome-oriented Codex review

Start review with `query({"op":"codex_read","args":{"threadId":"<thread>","view":"review"}})`. The default is the latest turn; existing `limit` and `cursor` request history. Each turn returns only `turnId`, `recordedStatus`, the complete `finalResponse`, `files` with `path`/`added`/`removed`, and `checks` with `command`/`exitCode`/a one-line `summary`. Thread identity, pagination, and ARC version remain in the envelope. Commentary, intermediate messages, command outputs, diffs, images, external inputs, and inbox payloads are omitted. Reading still acknowledges the returned turns. Compact/full views retain their existing behavior.

File counts use a valid recorded Git baseline, bounded by the next clean recorded turn baseline for historical turns, or native file-change diffs when Git evidence is unavailable. Git workspace counts may include concurrent or pre-existing changes. Historical uncommitted changes cannot be reconstructed from a Git commit alone. `files:null` means change evidence is unavailable; it does not mean no files changed. Native patch counts aggregate recorded edits per path. Binary counts can be null. Use `codex_changes` or full records for detailed evidence.

Checks recognize common validation commands (package-manager test/check/lint/build scripts, Cargo test/check/clippy/fmt, Node tests, and common standalone test/type/lint runners). Heredoc bodies are excluded from command discovery. Each exit code belongs to the native command batch, not independently to every extracted subcommand. Summaries preserve bounded native test-result lines when present; otherwise they state the process result without claiming tests passed. Custom command names may require full records. Very large final responses retain normal control_output pagination rather than truncating the final text.

## File transfers

Use `act({op:"write",args:{path:"/workspace/note.txt",content:"Hello\n"}})` for UTF-8 text. Its optional `expectedHash` checks the **existing** file before editing.

For verified binary writes, use `act({op:"fs",args:{action:"writeFile",params:{path:"/workspace/data.bin",dataBase64:"aGk=",expectedSha256:"8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"}}})`. `expectedSha256` covers the complete **resulting** file; mismatches return `SHA256_MISMATCH` without replacing the destination.

For larger files, send at most 8 MiB decoded bytes per chunk. Set `append:true,offset:0` on the first chunk of a new file, then use `append:true,offset:<previous sizeBytes>` for each subsequent chunk. Set `expectedSha256` to the cumulative digest when available, including on the final chunk. Each completed chunk becomes visible; use a temporary destination and `fs copy` when publication must wait for all chunks. Retain the receipt ID per chunk. Replaying the same receipt cannot duplicate bytes; a new append request with a stale offset fails with `OFFSET_MISMATCH`. ARC serializes transfers to the same resolved path, but external writers must be coordinated separately. The resulting file limit is 512 MiB.

Use `act({op:"fs",args:{action:"fetchFile",params:{path:"/workspace/archive.zip",url:"https://example.org/archive.zip",expectedSha256:"<sha256>"}}})` to download through the host's configured egress proxy. HTTPS redirects must remain HTTPS. `maxBytes` defaults to 64 MiB, with a 512 MiB ceiling; the download deadline is 120 seconds. Failed downloads leave the destination unchanged. These actions use the existing receipt lifecycle.

## Compact progress

`query({op:"codex_read",args:{threadId:"<thread>",statusOnly:true}})` returns `progress` alongside `runtimeStatus` and `turns:null`. Progress contains `turnId`, `latestAgentMessage` (480 characters), `messageTruncated`, `latestChecks` (three command batches with exit codes), `pendingInteractionCount`, `commits` (count and five recent commits), `elapsedMs`, and observation timestamps. Unknown evidence is null; it is not a successful check or zero changes. Pending callback counts can be unknown when the owner exposes only an interaction flag.

Status revisits read at most the latest native turn and cache its compact projection for five seconds (`cacheAgeMs` reports reuse). Git reads have a two-second budget and do not compute diffs or scan working files. Commits are repository changes since the recorded turn baseline, including concurrent writers; they are not proof of authorship. Elapsed time is wall time since that baseline. Tasks without a baseline expose the gap explicitly.

`codex_wait` timeouts include progress from the last native observation, with the same bounded Git evidence. The native observation may precede the timeout; inspect `progress.observedAt`. The Git read can add up to two seconds after the wait deadline. Continue using the same task and turn IDs.

## Task detail actions

The task panel and agents share operation owners. Local agents use `cli control <op> --stdin`; control sources use the existing `query` or `act` tool with `{op,args}`. Tool and notification envelopes are unchanged. Read `guide({op})` for the current schema.

| Panel action | Agent operation | Readback |
| --- | --- | --- |
| Answer or skip a question | `codex_pending` / `agent_pending`, then the supplied `codex_respond` / `agent_respond` arguments with the explicit answer or native cancellation result | `task_timeline`, pending ops and original receipt |
| Approve, bypass or reject an ARC dispatch | `receipt` with the original `requestId` and `action:approve/bypass/reject` | `receipt` |
| Allow or deny a native permission request | The pending request's respond op and native decision | `task_timeline` and pending ops |
| Send while active; send while idle | `codex_send` with `sendMode:next` queues when active and starts a turn when idle; other Agents use `agent_send` when idle | Receipt, `codex_queue`, `task_timeline` |
| Queue explicitly | `codex_send` with `sendMode:queue` | Receipt and `codex_queue` |
| Steer directly | `codex_send` with `sendMode:steer` | Receipt `dispatchMode` and `task_timeline` |
| Promote a queued message | `codex_queue_control` with `action:promote`, `threadId`, `queueId` | `codex_queue`: steering, steered, failed or unconfirmed |
| Cancel a queued message | `codex_queue_control` with `action:cancel`, `threadId`, `queueId` | `codex_queue`: cancelled |
| Stop | `codex_interrupt` / `agent_interrupt` | Receipt and wait/read ops |
| Pass or rework | `codex_review` / `agent_review` with `verdict:pass/rework` | `task_reviews` |
| Undo a local pass | `task_review_undo` with `id`, `turnId`, `reviewRequestId` | `task_reviews` |
| Retry or continue | `codex_send` / `agent_send` in the same task, with the user's continuation instruction | Receipt and wait/read ops |
| Open, resize, return, disclose, jump to latest or change follow mode | `task_panel_control` with `agent`, `id` and `action:open/width/back/disclose/latest/follow`; disclose uses a target from `task_panel`; follow requires `following` | `task_panel` or `cli app snapshot` with `modelOnly:true` |
| Mark a completed homepage bubble read without opening details | `task_mark_read` with `agent` and `id` | `task_bubble` with the same IDs, or `cli app snapshot` with `modelOnly:true` and `model.taskBubbles` |

| Open in the native Agent | `task_open` | Operation result |
| Inspect/copy a reply, question or tool result | `task_timeline` with `agent`, `id` | Original text and structured entries |
| Read an image or reveal a file | `task_resource` with `agent`, `id`, `path`, `action:image/reveal` | Operation result |

Bubble reads require Desktop and share the UI's persisted agent/task acknowledgements in WebView storage. `completed`, `unread`, `readAt` (Unix milliseconds or null), and `retained` are readable even after a marked bubble disappears. `retained` means the renderer still tracks the bubble, not that it fits in the visible slots. Acknowledgements survive renderer reloads, window recreation, app restarts, and Core reconnections. Retain the newest 1000 records for at most 30 days. A new observed turn clears that task's prior acknowledgement. Marking an active or unknown bubble read returns an actionable error. Repeating a completed read is idempotent while the acknowledgement is retained. Mark-read persists the acknowledgement before dismissing the bubble or returning success. This does not acknowledge notification inbox events or change native task history.

For example, call `act({op:"task_mark_read",args:{agent:"codex",id:"<threadId>"}})`, then `query({op:"task_bubble",args:{agent:"codex",id:"<threadId>"}})` to confirm `unread:false` and `readAt`. Discover current IDs in `app.snapshot`'s `model.taskBubbles`.
Answers sent through ARC retain their result, answering source and resolution time in `task_timeline.entries[].response`. Asynchronous question skips use `codex_respond` with `skipped:true` and the explicit native `result.answer`; the flag records provenance and never fabricates an answer. No interaction is answered or approved automatically. Question drafts and request pagination are local presentation; agents read all pending requests and submit only an explicit answer. Headless installations support task operations and timeline readback; panel navigation requires Desktop.

Explicit `next` mode makes the active-turn decision under the thread write lock. The control-source default `auto` retains its previous steer-or-start behavior. Explicit `queue` retains FIFO dispatch after a completed turn and pauses after a failed or interrupted predecessor. `promote` requires an active turn, reserves exactly one message, and never creates a turn. Queued submissions retain their originating source. Only authenticated local administration may inspect or cancel legacy orphaned queue records with no source ID; these records never dispatch automatically. Remote queue visibility remains restricted to the current source.

`THREAD_WRITER_BUSY` retains the native rejection and gives a recovery hint. `runtimeStatus:notLoaded` describes ARC's observation, not global writer availability. Read the original receipt, continue in the owning native session, or explicitly close that session before retrying the same thread. Do not delete writer locks or create another thread to bypass ownership. Unknown submissions require receipt reconciliation rather than automatic resubmission.

## Focused guide topics

`guide({topic:"notify"})` returns notification guidance and only the relevant enabled operations. `review` and `approvals` are scoped similarly; the default `loop` view lists common operations, including text and binary file transfer. `indexScope` identifies `topic`, `common`, or `full`.

Use `query({op:"guide",args:{topic:"notify",view:"full"}})` for a complete enabled operation index alongside that topic. Retain its `guideHash` and send the same topic/view with `knownGuideHash` to receive only `unchanged:true` when content has not changed. A hash from a different topic/view does not suppress the requested content. Use `query guide` for these op arguments; the frozen `guide` tool shape remains `topic`/`op` only.

## Verify a Claude cloud-session destination

Use the same authenticated control source throughout this flow:

1. Obtain the current conversation's complete cloud-session ID (`session_` or `cse_` followed by 24 ASCII letters/digits) or its `https://claude.ai/code/<session>` URL.
2. Register and verify in one call: `act({op:"notify_control",args:{action:"bind",target:"<session>",threadId:"<existing-source-owned-thread>"}})`. Omit `threadId` to register before dispatching work. Include it to bind an existing task and its pending wakeups without resending work. `verify:false` only binds. Binding persists if verification fails.
3. Pass the returned `notify:{channel:"claude-session",target}` on each future authorized dispatch. A target-only registration does not subscribe a task or become a global default. Retry verification with `notify_control({action:"verify",target})`. `notify_status` reports `verificationAttempts` and `lastVerificationDelivery` separately from task event attempts.
4. After receiving the code in that target conversation, call `act({op:"notification_ack",args:{target:"<session>",code:"<received-code>"}})` within five minutes. The same source must acknowledge it; receipts and status never expose the code.
5. Read `query({op:"notify_status",args:{target:"<session>"}})` and confirm the matching `targets[]` row has `reachability:"verified"`, `reason:"handshake-confirmed"`. Sending the challenge alone does not prove delivery.

On delivery failure or expiry, inspect status and delivery records, correct the destination or delivery failure, then request a new challenge. Bind each new continuation explicitly. Verification does not answer interactions or approve tasks.

## Operation outcome

MCP `isError:true` and CLI `ok:false` / exit 1 reflect failed, rejected, cancelled, not-executed, unconfirmed, and rolled-back operation results, including nested receipts and nonzero command exit codes. The top-level error preserves the nested reason; receipt IDs, next steps, and the result remain available in both MCP text and structured output for reconciliation. Pending/reserved receipts indicate acceptance only. A failed historical turn inside a list does not make that list request fail. Unconfirmed means the effect is unknown, not permission to replay.

## Response size and inbox revisits

Default control results above 12 KiB return a short preview, identity/status summary, and `outputId`. Read `control_output({outputId,offset:0,length:8192})` and follow `nextOffset` to reconstruct the full immutable JSON. Guide and explicit output pages are exempt; supported `view:"full"` requests use a 64 KiB inline threshold. Native method schemas include only transitively referenced definitions. Compact automatic `arcInbox` attachments suppress unchanged event bodies and retain `unchangedEvents` references and unread counts. `inbox_wait({timeoutMs:0})` returns full unread events; deduplication does not acknowledge them.

## Status and stalled submissions

Receipt `stateScope:"operation"` describes submission, not task completion. `codex_read` uses the same native turn classifier as `codex_wait`, with `stateScope:"turn"`, `recordedStatus`, and `runtimeStatus`. `notLoaded` is unknown ownership, not proof that no writer exists. Intermediate receipts expose `updatedAt`, `phaseAgeMs`, `progressStalled` after 30 seconds without a checkpoint, and an actionable `next`. Poll that original receipt until it returns a turn ID; for stalled submission inspect CLI logs/doctor and the owning app without redispatching. Running, blocked, failed, and unconfirmed responses also provide a next read or wait. CLI wait stops immediately on a failed operation and preserves its receipt and error.

## Interrupt the active turn

Use `act({op:"codex_interrupt",args:{threadId:"<id>"}})` to interrupt the currently active native turn. ARC resolves it under the thread lock and records `turnId` in the receipt before submitting. Explicit `turnId` keeps native stale-turn protection. `NO_ACTIVE_TURN` means ARC could not confirm an active turn; read status before trying again. Replay the returned requestId to reconcile the same attempt rather than selecting a later turn.

## Questions and answered history

`codex_pending` requests include `questionSummary`; `codex_read({statusOnly:true})` and `codex_wait` progress include `pendingInteractions`; inbox events include `questionSummary`. These bounded previews contain question text and option labels. Use the original pending request to respond. Read `query({op:"codex_interactions",args:{threadId:"<id>"}})` for flat answered records with questions/options, response, answering source, and timestamp. Follow `nextOffset` for older records. Task panels display answered questions outside both turn and process disclosures.

## Archive ended threads

Archiving ended self-test threads is optional and is not an acceptance completion step. Keep traces available for observation or archive them later as desired. When archival is chosen, use `act({op:"codex_archive",args:{threadId:"<id>"}})` for explicitly selected ended native threads. ARC submits native `thread/archive` through its app-server and retains an idempotent receipt, including for Desktop-created history. It does not interrupt running work. `ARCHIVE_ACTIVE_TURN` requires completion or an explicit interrupt first. `ARCHIVE_WRITER_BUSY` preserves the native reason and requires releasing or archiving that exact thread from its owning session. The current Desktop follower protocol has no archive/release request, so ARC cannot release another owner's writer. Never remove lock files, move rollouts manually, close unrelated sessions, or repeatedly replay a blocked archive.

## Task detail interaction ownership

Task details display execution and control-source review status. Users answer pending questions and permission requests during execution of any task source, including ARC-local turns. The panel has no composer, purpose selector, queue controls, stop, or review actions. The latest failed outcome card offers Retry through `codex_send(sendMode:"next")` or `agent_send`, with an explicit continuation prompt in the same task and a stable receipt requestId. It does not replay the original input. The latest interrupted Codex card offers Resume through `codex_resume`. Control sources use the dedicated dispatch, queue, interrupt, and review ops. For acceptance follow-ups, submit `purpose:"self-test", notify:null` through `codex_send` or `agent_send`. Codex continuations inherit persisted self-test purpose when omitted.

## Task list cost

`codex_tasks({archived:true,searchTerm:"probe",enrich:false})` returns native list metadata without per-thread reads. Archived lists default to `enrich:false`; other lists preserve live enrichment by default. The compact signature lists both archive and search filters. Metadata-only rows expose `runtimeStatus:null`, `runtimeSource:"not-requested"`; use `codex_read` on a selected thread for live status.

## Stable history revisits

`task_timeline({agent:"codex",id,expectedHash})` suppresses unchanged entries with `unchanged:true`. A history refresh preserves entry timestamps, positions, cursor, and `snapshotHash` when native content is unchanged. `after` remains the incremental cursor. Unsubscribe still reports partial coverage until a real subscription resumes; history refresh does not claim live observation.

## Failure projection

Read `error.code`, `error.message`, and `next` from the public result (the CLI envelope for CLI calls). Repeated receipt errors are omitted from nested results. Native RPC code/data remain in `error.rpcError`; its message is promoted to `error.message`. Historical errors inside arrays remain untouched. Receipt identities and original outcomes are preserved.

## First-use accessibility readiness

`screen({action:"tree",bundleId,pid,readyTimeoutMs:2000})` automatically re-reads a chrome-only AX tree while the app activates its accessibility content. `ready:true` confirms content beyond window chrome; `ready:false` includes `incompleteReason` and a same-window retry. `truncated:false` alone does not prove readiness. A deliberately chrome-only window can remain incomplete. Use `readyTimeoutMs:0` for a single read.

## Fast writer diagnosis

`codex_owner({threadId})` probes the native thread writer lock without creating, deleting, or rewriting a lock file. A free lock is acquired nonblocking and immediately released. Held locks are classified as connector, Desktop follower owner, or external; Desktop discovery is bounded. Sends and loads reject confirmed external occupancy before navigation. `codex_read({threadId,statusOnly:true})` retains that diagnosis in `ownership` and `reason:"external-writer-held"`. An unheld probe is only a point-in-time observation; native submission still enforces ownership. Unknown probes never imply that a write is safe.

## Writer release and archive handoff

Read `codex_owner({threadId})` for available process IDs, executable/app paths, and the next owner step. Process evidence identifies open descriptors on the held lock; an empty list means process attribution is unavailable, not that the lock is free. Use `codex_release({threadId})` for an idle ARC connector-owned thread, or `codex_archive({threadId,release:true})` to release then archive. ARC uses native `thread/unsubscribe` only for its own idle writer.

Desktop follower IPC currently exposes no per-thread release/archive request. `WRITER_RELEASE_REQUIRES_OWNER` returns a `task_open` action for the exact thread. In the owning ChatGPT/Codex app, select that thread and choose **Archive** from its thread menu. For an external terminal owner, end that exact native session normally. Closing the ARC panel or unsubscribing ARC does not release a Desktop writer. Re-probe ownership before a new archive attempt. ARC never terminates a shared process or removes locks to force a handoff.

### Isolated observation faults

`acceptance_fault({threadId,mode:"placeholder"|"read-rejection"|"clear",durationMs?})` is available only through the local CLI in an isolated debug instance started with `npm run dev:isolated`. The thread's latest ARC dispatch must have `purpose:"self-test"`. The launcher supplies a matching instance marker in its separate state directory. Production builds reject this operation.

Example: `echo '{"threadId":"<self-test-thread-id>","mode":"placeholder"}' | arc cli --state-dir <isolated-state> control acceptance_fault --stdin`.

`placeholder` overlays a null-ID active turn on the real Desktop follower read path, exercising the existing steering guard without changing native history. Use a Desktop-owned self-test thread. `read-rejection` rejects native thread reads at the normal request boundary, exercising public error and recovery projection. Responses identify injected evidence. These switches validate ARC behavior, not an upstream provider failure. Faults expire after five minutes by default (maximum ten), disappear on restart, and can be cleared explicitly. Clear injected faults before returning to normal observation or optionally archiving the thread.

A bounded Desktop owner-discovery timeout does not reject a fresh, confirmed unheld thread. Explicit creation may reveal that same thread and wait for its owner; write-submission timeouts remain unconfirmed and are never treated as permission to resubmit.

Thread reads, item reads, and turn-history reads report `THREAD_WRITER_BUSY` when an external writer is confirmed. `ownership` includes lock/process evidence, or native rejection evidence with a separate current lock observation. The isolated `read-rejection` fault induces this same mapping and labels its evidence `injected:true`.

Executable `next` objects carry schema-valid operation arguments. Writer conflicts point to `codex_owner({threadId})`; status-only arguments belong to `codex_read`, never `codex_owner`. Optional absent turn IDs are omitted from wait continuations. Interaction response templates still require the caller’s actual decision before submission.

`codex_release` succeeds with `alreadyUnheld:true` when the writer is already confirmed unheld, regardless of its former owner. `codex_archive({threadId,release:true})` then proceeds directly to native archival. Held or unknown ownership still requires confirmation and the existing safe handoff rules.

Archived `codex_tasks` with `enrich:false` reads the native Codex SQLite index read-only, avoiding app-server rollout scans and excluding subagent sources. Search matches title, preview and first-user-message metadata; project filtering and opaque keyset pagination remain available. Each call observes current committed index data; ARC does not maintain a stale result cache. `metadataSource` reports `native-sqlite-index` or `native-app-server` fallback when the upstream index is absent or its schema is unsupported. Keep filters unchanged while following a cursor. This path does not load history or acquire writers.

Writer/archive errors expose one public reason and numeric `nativeCode` where available, rather than a second serialized RPC error. Notification verification failures retain a structured continuation; delivery failures point to `notify_control({action:"verify",target})` after correcting the cause. Other operation failures without a more specific recovery step point to that operation’s live guide.

`task_panel` and `task_panel_control` default to `view:"compact"`: purpose, following, atLatest, expanded width mode, state, current turn, timeline metadata and counts remain inline. Use `query({op:"task_panel",args:{agent:"codex",id,view:"full"}})` when you need disclosure IDs, queued message bodies, responses or full timeline content. Large full views retain normal output continuation.

### Archiving an idle task

`codex_archive({threadId,release:true})` skips redundant release when the writer is unheld or the connector owns an idle native session. Native archive handles that session atomically. Active turns and pending interactions are rejected first. Desktop and external writers still require their owner handoff; ARC never deletes a lock or ends another session.

### Interrupted task reads

Task reads and waits expose `stateScope:"turn"`. A normally interrupted task returns `state:"cancelled"` and its native recorded status as a successful read (MCP isError:false and CLI ok:true). A cancelled dispatch operation remains an operation failure.

### Claude cloud session not found

`CLAUDE_SESSION_NOT_FOUND` / `reason:"claude-session-not-found"` preserves the CLI's distinct Session not found failure. A different host Claude account or a wrong session ID are likely causes; ARC does not infer the session owner's identity. For this diagnosis, ARC attempts a bounded, read-only `claude auth status --json` probe using the same CLI discovery and environment. `error.localAccount` exposes only `loggedIn`, `email`, `authMethod`, the selected ARC profile ID and observation time when obtainable; unavailable identity does not hide the original failure. Tokens, credentials and raw auth output are never returned or stored. `notify_status.targets[].lastVerificationError` retains this diagnosis for the same control source.

Follow `next` to `notify_control({action:"route",target})`. Select the session owner profile with `accountId`, correct the session ID if needed, then call `notify_control({action:"verify",target})`. Binding remains registered. Login and profile management remain explicit host actions. ARC never logs in or changes the system Claude account automatically. Successful send still requires acknowledgement with the code received in that session.

## Pending request routing

`codex_pending`, `agent_pending`, `progress.pendingInteractions`, and inbox events
expose `routing` alongside the original native request. Routing never reserves,
answers, or approves a request. The first accepted answer still wins, including
answers read through pending or inbox while routing is deferred.

| Field | Meaning |
| --- | --- |
| `state` | `deferred`, `paused`, `routed`, or `not-routable` |
| `deferUntil` | Unix milliseconds for a running countdown; otherwise `null` |
| `pausedBy` | `user` or the pausing control source ID; otherwise `null` |
| `reason` | Machine-readable routing reason |

A new request waits only when its task detail is open in the focused, visible ARC
window and the source has a verified push path. `requestRoutingDelaySeconds` in
task settings defaults to 15 and accepts integers from 0 to 300. Changing it affects
new requests. Without presence, routing is immediate. Opening the detail later
never delays an already-routed request. Losing presence ends a running countdown.
Dock focus, typing, selection and other interaction pause it; explicit resume
uses the remaining time. A paused request remains paused until resume, handoff or
Core recovery. Recovery cancels deferred and paused timers on the first refreshed
observation. Native callbacks that cannot survive restart retain their existing
owner-specific limitations.

Without a verified push path (including ChatGPT Chat and unverified targets), the
state is `not-routable` and the source handles the request at its next check.
If a push path becomes available later, ARC routes immediately. `routed` means
eligible for notification scheduling, not proof of delivery. Notification buckets,
breakers, mutes and retries still apply. Active `notification` subscriptions receive
the request only once routing permits it; pending/inbox reads remain immediate.

Use `act` with `request_route`. Arguments are `taskId` (Codex thread ID or Agent
task ID), `id` (pending `responseId`, or native request ID converted to a string),
`agent` (defaults to `codex`), and `action` (`read`, `handoff`, `pause`, `resume`).
Only the task's bound source may call it. Actions are idempotent for the current
routing state and never reopen an answered request.

```json
{"op":"request_route","args":{"taskId":"<thread-id>","id":"<responseId>","action":"handoff"}}
{"op":"request_route","args":{"agent":"pi","taskId":"<task-id>","id":"<native-id>","action":"pause"}}
{"op":"request_route","args":{"taskId":"<thread-id>","id":"<responseId>","action":"resume"}}
```

## Acceptance environment

Use `act({op:"app_env",args:{action:"read"}})` to inspect the current instance.
`action:"set"` merges explicit `reducedMotion`, `colorScheme`, `locale`,
`windowWidth`, `taskPanelWidth`, `presence` and `clock` inputs. `action:"clear"`
restores normal resolution. The guide declares ranges and supported values.
The existing `guide`, `query`, `act` tool shapes and notification envelope are
unchanged. Read `app snapshot` for rendered `model.env` values and provenance.

Acceptance MUST never modify host system settings. Use these app/AX inputs or
report a gap. Overrides expire using real time, remain separate from exported
preferences and do not alter native Codex timing. See
[instance environment](../dev/acceptance.md#instance-environment) for CLI examples,
clock boundaries and width restoration.
