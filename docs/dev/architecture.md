# Architecture and lifecycle

[Development](development.md) · [Tools](../reference/tools.md) · [Agents](../reference/agents.md)

## Processes and responsibilities

```text
React / Tauri Desktop ── authenticated local management API ── Core
                                                               ├─ Ingress A ─ HTTPS / OAuth
CLI / management MCP ── authenticated local management API ─────┤─ Ingress B ─ OpenAI Tunnel
                                                               └─ Execution
                                                                   ├─ Control → Codex owner
                                                                   └─ AgentHost → Pi / ACP
```

React renders in the system WebView. Desktop owns the main window, tray, native panels, permissions, and updates. arc-core provides shared business and runtime capabilities. runtime maintains one file-locked Core per state directory. Local entry points such as Desktop and CLI hold leases. Different builds cannot share an active owner. Core exits after the final lease is released. Daemon mode can remain resident independently.

service::Service owns one Control, AgentHost, execution::Execution, and ingress collection. Execution composes business capabilities. kernel stores provider-independent origin, tool policy, receipts, results, and events. Transports package requests and results. egress projects errors and output consistently.

Core's `resources` module owns process resource policy. It runs at runtime startup and Service initialization, and checks again before each Rpc creates app-server. Desktop, login startup, and Linux daemon share this path. Login items do not maintain separate limits. macOS/Linux attempt to raise the `RLIMIT_NOFILE` soft limit to 8192 while preserving higher soft limits and the original hard limit. macOS also respects `OPEN_MAX` and the read-only `kern.maxfilesperproc`. Global system limits remain unchanged. Each attempt records the original, target, attempted, and measured values and failure reason. Failure or a below-target limit does not stop Core.

Status requests read resources on demand without a monitoring task. Core limits are measured in-process. Rpc records the child PID, creation time, and inherited startup limits. Linux reads child limits through read-only prlimit and counts `/proc/<pid>/fd`. macOS enumerates descriptors with `proc_pidinfo(PROC_PIDLISTFDS)` and labels limits as inherited startup records. Child exit status is checked before and after sampling. Exit or read failure yields null counts and unknown status without sending child commands. Windows reports not applicable. Communication readiness is separate from resource health. Known descriptor use at 90% of the soft limit produces `APP_SERVER_FD_PRESSURE`. Degraded limits produce `CORE_NOFILE_DEGRADED` or `APP_SERVER_NOFILE_DEGRADED`. These diagnostics neither unsubscribe threads nor restart processes.

Service status, CLI status/doctor, and Settings share resource snapshots and diagnostics. doctor uses `permissions/passive`. Codex login and command permissions remain unknown in passive reads. The explicit permission page retains active probing. Resource diagnostics never start app-server. See [CLI resource diagnostics](../reference/cli.md#resource-diagnostics).

## Ingress and authentication

Each ingress owns its lifecycle lock, listener, provider process, temporary directory, URL, verification challenge, logs, and errors. Stop/failure affects only that ingress. Core shuts down ingresses before its AgentHost/Control. All ingresses share project and task space. Ingress names are not authenticated users.

OpenAI Tunnel uses official identities and clients. Its stdio adapter forwards to local management using ARC_NATIVE_PORT, ARC_NATIVE_TOKEN, and ARC_INGRESS_ID. Each HTTPS ingress exposes MCP and OAuth routes on its own listener. A tunnel or reverse proxy terminates TLS. Listener creation fixes the ingress. Requests cannot select another ingress through headers or parameters.

The management API binds a random loopback port and validates Host, Origin, and a private token. Authentication data lives in the protected state directory. Remote HTTPS does not expose management. OAuth, Bearer, None, and OpenAI authentication follow ingress configuration. [OAuth](../reference/oauth.md) owns protocol details.

Control-source MCP tools are fixed as guide/query/act. catalog.tools stores frozen definitions. catalog.ops stores operation schemas, examples, and descriptions. toolExposure stores groups, presets, dependencies, and advanced flags. Op allowlists constrain both discovery and execution. Local management retains the full op set. The transport unwraps requests into the existing validation/execution chain. egress attaches the catalog hash arcVersion to all results. Origin carries ingressId, controlSource, and authType through receipts and background work without changing task ownership.

## Task ownership and execution

New Codex tasks execute in Desktop by default. Disabling auto-open sends new tasks to ARC App Server without migrating historical tasks. Linux always uses background App Server. Explicit send/resume first navigates to unloaded Desktop threads and waits for an owner. Only confirmed absence of an owner after waiting permits ARC App Server to resume the same thread. It never creates a replacement thread. Disconnection, timeout, or uncertain submission never causes a second dispatch. Background sends resume only notLoaded threads with excludeTurns and append input to active turns.

Seed creation persists native state by setting a title. Without a title, it uses the first 120 characters of the prompt's first nonempty line, or ARC task without text. An independent App Server reads metadata before handing off to Desktop. This does not depend on rollout paths or file size. Seed failures are archived before the creating process exits. Later confirmed creation failures are archived only when no turn exists. Receipts retain cleanup results, failure phase, and each seed step's duration.

Control shares Desktop IPC using macOS Unix sockets or Windows named pipes, checking user, owner, and response origin. It reconnects on demand. Owner changes or disconnects clear snapshots. Snapshots last at most four seconds. Sending performs a lightweight read, chooses steer/start, and reuses actual task configuration. Windows discovers the current user's Store Codex CLI and caches runtime files by content hash.

Each Pi/ACP task owns a process. AgentHost maps ARC taskId to upstream sessionId. Generic drivers discover, start, and negotiate using descriptors. Codex does not use agent_* adapters. Upstream resume capability determines session/load support. Uncertain writes are not replayed.

## Receipts, observation, and notifications

Writes reserve an idempotent UUID receipt before dispatch. Repeated IDs with identical arguments read the original operation. Conflicting arguments are rejected. Request timeout returns pending. Connection loss after submission returns unconfirmed. Both retain original identifiers for readback.

waiter combines event wakeups with real state checks in default 30-second segments. Cancelling a wait only releases the wait, not the task. Codex retains its owner. Pi/ACP use live process state. Waiting holds no global lock and never resumes stopped execution processes. ARC App Server waiters read metadata and paginated turns through the selected turn without the old full-history interface.

claude_notify persists per-thread/turn bindings, actual dispatch origin, and delivery records. governance stores per-target token buckets, recent batches, reachability handshakes, and reversible thread/target notification controls. It does not classify task loops. One scheduler handles all events. needs-input and approvals skip only the 30-second coalescing window and still consume tokens. Observation and sending are separate. Record locks are released during network requests. Retries back off exponentially from 10 seconds to 5 minutes, retaining token eligibility and eventId. Mute, hourly digest, rebind, and breaker affect only notifications. Queries and controls are ingress-isolated. Breaker or sustained token starvation produces one local system escalation, reset after recovery. Delivery timing records queue reasons and elapsed times. CLI acknowledgement does not prove receiver display. Answered interactions cancel unsent notifications. Unfinished bindings and pending deliveries remain. Success requires Claude CLI JSON ok=true and the same session_id. See [notification contracts](../reference/tools.md#control-source-notifications).

## Data and observation

Projects come from native project/list. ID/name resolution caches for 30 seconds. Workspace and filesystem rules resolve paths. Review views enforce resource boundaries. Git baselines capture pre-submission HEAD and dirty status. Turn comparisons describe the current workspace, including pre-existing changes.

kernel::results stores immutable large-result snapshots with UTF-16 pagination. Pi/ACP native events use an active JSONL tail and verified gzip segments. Codex owns its native history. User logs and event archives are separate. [Tools](../reference/tools.md#output-events-and-logs) owns budgets and retention periods.

## Desktop lifecycle

- Connect starts the selected ingress and provider. Agent execution connections initialize on demand.
- Disconnect stops ingress processes and forwarding. Background task lifecycle is unchanged.
- Closing the window hides it. Tray and connections continue.
- Quit saves the running ingress set and releases the Desktop lease. Other leases may keep Core alive.
- Reopening restores previously running ingresses. Previously disconnected ones remain disconnected.
- Update verifies signatures, requires other entry points to exit, drains requests, suspends auto-start, and waits for the Core file lock before installation. Failure restores clients and connections.

Tray left-click opens the main window. Right-click opens a native menu without another WebView. Platform implementations own screen capture and native windows. Linux returns explicit unsupported results.

## State and build boundaries

The state directory is agent-remote-control. Development uses -dev. Isolated previews explicitly use -preview. Identities, environment variables, and deep links retain no old aliases or automatic identity migration. app/ stores preferences.json and native.json runtime metadata. After acquiring the state lock and before reading metadata, Core renames legacy web/ to app/. If both exist, it retains app/ and removes web/. Production, -dev, and -preview share this startup path. Packages contain native executables and static resources only. Node/npm are build tools. CLI guide and catalogs are embedded at build time and require rebuilding after edits.

## Permissions and readiness

Core aggregates read-only permissions status for CLI doctor and overview. arc-screen status checks Accessibility and Screen Recording. Tools only preflight and return structured PERMISSION_REQUIRED when missing. Explicit requests originate from Desktop's permission page through helper request. Core heuristically opens the FDA-protected TCC database without reading content. command separately performs a zero-byte read through Codex app-server command/exec. Unknown never means granted.

Desktop queries UserNotifications. Only a user click requests authorization. Core's notification fallback uses the existing authenticated Desktop channel to request permissions/notify. Offline Desktop or missing permission only logs the failure and never invokes osascript. Login startup checks LaunchAgent and launchctl print-disabled. Ingress verification reuses diagnostics. Claude reuses CLI discovery and auth status. Codex login reuses account/read.

The permission page refreshes on window focus and manually. System Settings navigation remains local to Desktop without new MCP tools.

Packaged Desktop's startup chain attributes Full Disk Access to ARC App. Core and its Codex app-server child inherit that identity. A terminal-launched Core may inherit terminal identity and cannot prove App readiness.

SubscriptionService schedules provider quota reads and stores enabled state and refresh intervals. Agent participation determines sources automatically without saved source selection or fixed windows. Homepage rings use upstream weekly quota. Details retain other windows. Providers own native credentials and upstream responses. Successful readings cache under subscriptions/readings and restore as stale. Failures back off. Expired windows hide. Desktop subscriptions:changed and browser /api/subscriptions/events share snapshots. Legacy cache history is removed on read. Local usage, token aggregation, and prices are no longer collected.

Desktop interactions reuse thread IPC snapshots and change broadcasts with a two-second observation fallback. Asynchronous questions match accepted question-reply messages by original questionItemId. codex_respond sends native Desktop reply text for asynchronous questions. Approval, input, and elicitation responses use the corresponding follower interface with the original execution owner, then confirm disappearance. Identity verification and unpublished response paths only notify and direct the user to Desktop. ARC neither takes ownership nor auto-approves.

`dispatch_queue` persists pending parameters and separate dispatch receipts. Per-thread write locks protect checks and submission. Notification-observer capacity recovery starts another turn only for serverOverloaded failures without tool activity. Both use durable requestId to avoid blind resubmission after Core restarts. `respond_tokens` supplies expiring ingress-isolated aliases for original interactions without replacing owner validation.

`claude_notify/continuation` recognizes Desktop native retries in the same observation chain. It requires a failed/interrupted predecessor, adjacency in snapshot and persisted history, a known retry trigger, no new user message, complete native turn configuration, and a ten-minute window after predecessor termination. It first idempotently records native-retry/retryOf in dispatch_policy, then inherits ingress and notification binding. The new turn shares terminal notification, review, and history paths. New content or insufficient evidence prevents inclusion. No independent poller is added. See [native retry](control-loop.md#72-native-retry).
