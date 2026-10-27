# Product component inventory

This inventory describes the current `ui/` implementation, organized by product object. It is a source inventory, not a proposed component architecture. Component names below include named functions and explicitly identified inline render blocks. Callers are direct render callers unless an entry describes a complete route.

The target forms are **Chip** (inline name and state dot), **Node** (homepage topology), **Row** (panel list entry with name, secondary information and state), and **Card** (panel summary with facts and header actions). **Mixed** means a screen, editor, or fragment crosses these forms. An approximate form does not imply that the full target contract exists. Existing task bubble densities (`compact`, `standard`, `detailed`) are separate from these four forms.

Paths are repository-relative. Visual differences describe markup and stylesheet rules in `ui/style.css`, `ui/product.css`, `ui/components/activity/activity.css`, `ui/components/TaskDetail.css`, and `ui/subscriptions/bubble.css`; they do not imply visual acceptance. “Not displayed” means no dedicated presentation of that field in the relevant object views; IDs and other fields can still drive association, filtering, actions, or fallbacks.

## Identity and fixture boundaries

- SRC platform metadata comes from `ui/controlSources.ts` and `shared/control-sources.json`. Product IDs such as `claude` and vendor/platform IDs such as `anthropic` are distinct.
- An SRC account view can represent a `ControlSource` (one authorized client identity) or a `ProviderAccount` (the native account grouping one or more sources). They are not interchangeable records.
- AGENT platform is `Agent`; AGENT account is a `ProviderAccount` plus an `AccountAgentProfile`. Multiple profiles and both SRC/AGENT roles can belong to one provider account. The UI does not define four independent density components for either role.
- TUNNEL means the connection/ingress object here, including local, relay, HTTPS, and OpenAI Secure Tunnel transports. Current topology lines are projections of nodes, not one component per `Ingress`.
- TASK appears as activity sessions, native conversation history, dispatch receipts, and timelines. These have different types and observable state models.

All scenario names below refer to `tooling/acceptance/scenarios/<name>.json`, loaded by `ui/scenarios.ts`. A family such as `p3-source-product-*` means existing matching files, including theme/language variations, not an assertion that every combination exists.

| Fixture set | What the fixture supplies or initially opens |
| --- | --- |
| `requests-light`, `requests-dark`, `requests-narrow` | Real request and relay objects: paging, secret/multiple answers, submission states, authorization error, privacy, deployment account choice, member review and sheet keyboard/focus. |
| `src-tunnel-light`, `src-tunnel-dark`, `src-tunnel-narrow`, `src-account-multiple` | SRC/TUNNEL objects and grouped source inspector; independent keyboard targets, errors, missing records, privacy and mutation selection. |
| `shells-light`, `shells-dark`, `shells-narrow` | Actual shells, fixed observation time, local action callbacks, unknown branding/state, stale/unknown freshness, disabled/missing copy and copy error. Narrow viewport and privacy toggle are interactive checks. |
| `light`, `dark`, `single-task`, `parallel-seven`, `narrow-tentacles`, `long-multilingual`, `idle` | Homepage nodes, wires, hub, task bubbles, navigation; `idle` has no agents/tasks but retains the base source. |
| `topology-accounts` | `ui/topology/scenarioAccounts.ts`: multiple identities, shared SRC/AGENT account, repeated Unidentified aliases, account quotas and task attribution. Tree/flat and collapse changes require interaction. |
| `accounts` | Accounts page; `ui/scenarioAccounts.ts` adds source-only, agent-only, dual-role, signed-out and unfinished accounts, spare connections, and account actions. Its list response omits email/orgName; detail reads retain them. |
| `source-panel` | Opens the base source panel and installs the account route handler, while `topology-accounts` supplies static account responses. Both populate account views through asynchronous reads. Account/connection tabs require interaction. |
| `left-panel` | Opens SourcePanel for `fixture-source`, whose transport/credential are local but whose ingress ID is not `local-cli`; it renders an identity-unavailable header because this scenario supplies no accounts. Built-in `local-cli` itself is excluded by `ui/sourcePresentation.ts::isLocalSource`. |
| `right-panel`, `agent-panel`, `agent-panel-empty`, `agent-panel-no-quota`, `agent-panel-unread`, `agent-panel-used` | Agent overview and conversations; history pagination, empty, unread, quota absent/present, used percentage and absolute reset time. |
| `bubbles-compact`, `bubbles-standard`, `bubbles-detailed`, `bubbles-crowded`, `bubbles-pending`, `task-queue-overflow`, `approval` | Bubble density, width, auto-compaction, completion/attention and overflow; `task-queue-overflow` is homepage activity overflow, not queued input messages. |
| `task-actions`, `timeline-multi-turn`, `timeline-pending`, `task-wide-markdown`, `task-long-question`, `task-long-approval`, `task-turn-failed`, `task-turn-interrupted`, `task-owner-connector`, `task-owner-desktop`, `task-routing-*` | Task detail, timeline, request dock/sheet, receipts, outcome, ownership and routing. Narrow request presentation depends on panel width. |
| `p3-source-*`, `p3-workspace-add-*`, `p3-welcome-*` | Source product/connection selection, address, OAuth approval, success, source/connection lists and welcome. |
| `p3-connection-*`, `p3-stacked-*` | Connection method, join, local, own provider, secure tunnel, relay progress, completion and stacked setup. `p3-connection-detail-*` initially opens connection details, including joined relays. |
| `p4-switch-*` | Connection selection, address, reauthorization, disconnected list/detail, stacked setup and completed switch. |
| `updates-settling*`, `updates-replacement-*`, `updates-countdown`, other `updates-*` | Update work groups/dock/panel. Answer controls additionally require a matching live activity interaction; a work-item `question` alone does not render InteractionRequestCard. |

The `debt-*` page fixtures also mount Agents settings, merge/login dialogs and hosted-relay administration. Advanced ingress details and every provider failure are not comprehensively covered. The SRC/TUNNEL fixtures include transport errors, revoked sources, missing identities and privacy toggling; most older host fixtures start with ready connections. Fixture initialization keeps privacy on until an explicit toggle.

## Cross-cutting findings

See [Component system specification](component-spec.md) for the target contracts. The counts below describe parallel presentation families, not interchangeable domain objects.

| Area | Source-backed finding |
| --- | --- |
| Account snapshots | **Known issue; fix in progress in `account-store-sync` (reported by the control source).** `ui/state/accounts.ts::useAccounts` refreshes every 10 seconds, fetches every row's detail, applies `controlSourceAccounts` and filters empty notification targets. `ui/topology/accountState.ts::useTopologyAccounts` lists accounts when its revision changes, then refreshes quota-eligible accounts (`quotaProviderId` or claude/codex profiles) every 180 seconds and merges only their quota. It does not apply `controlSourceAccounts`. Identity, filtering and freshness can therefore disagree. This inventory does not claim that the pending fix has landed. |
| Platform logos | One presentation entry point, `ui/components/ui/PlatformIcon.tsx`, resolves source, Agent and provider branding. AccountAvatar selects the role in its adapter; AgentQuotaIcon retains the ring composite; QuotaBubble retains its provider mask. Existing source and Agent asset collections remain unchanged. |
| Platform selection | SrcPlatformRow supplies presentation inside SingleChoice. `AddControlSource.products` explicitly lists claude/chatgpt/gemini/grok/grok-bot/microsoft-copilot/local-code/local-desktop/custom and splits local/remote choices. `IngressDialog` uses registry `curatedSources` plus custom. `SourceProductChoice` starts with claude/chatgpt/gemini/grok, then offers all registry entries except local-cli plus an unknown-current-value fallback. Their option sets and layouts differ. |
| List rows | Object Rows compose EntityRow for SRC/TUNNEL hosts. EntityRow also frames mixed AccountsPage account/profile rows, system permission rows, SourceDispatches, AgentConversations and TasksPage entries. Task composites retain their domain content and contextual motion. Settings Row and OAuth grant history remain distinct renderers. |
| Cards | SRC/TUNNEL Cards compose EntityCard for source identity, connection facts, hosted relay summaries and setup success. EntityCard also frames account roles, OAuth pairing forms and motion/reorder Agent catalog cards. Quota window cards remain inside the existing quota composite. TasksPage entries use EntityRow. |
| Headers | SectionHeader frames source/account/Agent/task panels, setup layers, source and hosting sections, conversation groups, update panels, request pagers, receipts and quota headings. Dialog retains its own overlay header and focus/title ownership; Group retains its primitive contract. |
| Feedback and switches | Notice and LoadingIndicator remain shared feedback primitives. The unused ErrorCallout was removed. ConnectionOverview keeps its existing async power behavior; Switch retains its contract. |
| State presentation | `ui/components/objects/statePresentation.ts` is the domain/projected-state map. It receives existing ingressState, dispatchState and taskState outputs; topology projections stay in their owners. StateBadge renders mapped tones, label keys and icons. Notification binding and audit outcomes remain outside this map. |
| Fixture gaps | No initial scenario opens Tasks, Records or Permissions. **Settings is partially covered:** `updates-settings` sets `settingsUpdates`, which navigates to Settings; general/appearance/network/permission states lack dedicated initial fixtures. No initial fixture mounts AgentsSettings, AgentDisplaySettings, MergeAccounts, AddAccount, RelayHosting or OAuthGrants. Reachability through an existing fixture is not coverage of their state families. No fixture shows both homepage wings empty: the only empty-Agent fixture, `idle`, retains the base source; welcome scenarios hide/inert the underlying homepage. |

## SRC platform

`ui/components/objects/src-platform/` exports `SrcPlatformChip`, `SrcPlatformNode`, `SrcPlatformRow` and `SrcPlatformCard` through its local index. Product IDs resolve through `controlSource`; vendor IDs never substitute for product IDs.

| Component / callers | Rendered data and boundary |
| --- | --- |
| Chip / SourcePanel header | Registry name and source-role artwork; optional state only from supplied live sources. Unknown products and unresolved historical references remain text. |
| Node / ConnectionOverview, accountViews | Registry name/artwork and caller-projected wire state, selection, newly-added and keyboard reorder callbacks. Existing GraphNode geometry and topology selection stay in their hosts. |
| Row / AddControlSource, IngressDialog, SourceProductChoice | Registry name/artwork, optional explicit label and eligibility constraint. SingleChoice owns selection, keyboard navigation, disabled reasons and dropdown fallback. |
| Card / browser and design mounts | Account count derived from supplied associations, explicit source Rows, add and setup/documentation callbacks. Sources sharing an account retain distinct source labels. No new L1 panel is introduced. |

**Limits.** Activity SourceBadge remains the compact, icon-only overlay on the existing phase tile. It does not claim live state. Platform Card is mountable but has no standalone production inspector until panel placement is approved. Selection sets and local/remote eligibility remain flow-specific.

## SRC account / control source

`ui/components/objects/src-account/` exports `SrcAccountChip`, `SrcAccountNode`, `SrcAccountRow` and `SrcAccountCard`. These consume ControlSource and optional ProviderAccount records without synthesizing an account from a source label.

| Component / callers | Rendered data and boundary |
| --- | --- |
| Chip / ActivityTimeline provenance | Resolved account alias or source label, source artwork and live source state when supplied. Historical dispatch provenance has no invented live state or navigation. |
| Node / ConnectionOverview, accountViews | Source label or account alias, tree/flat platform context, stable Unidentified suffix and projected wire state. Existing topology grouping, geometry and Agent quota rendering remain in their owners. |
| Row / RemoteLinkPage source list and carried-source list, AccountDetail source roles, SourcePanel grouped-source selector, platform Card | Name, artwork, source/pending-switch state and optional masked email. The optional connection is a separate, keyboard-reachable TUNNEL Chip; it never sits inside the row navigation button. Source-specific selectors retain source labels. Missing records render unavailable text rather than raw IDs. |
| Card / SourcePanel account tab, SourceConnection summary | Alias, masked email/org, plan, selected source label/state, connected/last-seen facts, TUNNEL Chip and the currently associated authorization request state. Identity conflicts/unresolved states get a notice without raw evidence. Fetching, alias/account maintenance, per-source mutations and confirmations remain in hosts. |

SourcePanel keeps its existing activity/account/connection tabs. An account with several sources has one inspector and explicit source rows; Change connection and disconnect appear only after source selection. Recent dispatches remain associated with their actual source. The SRC inspector omits raw identityKey, quota and connection enable controls. The connection detail owns the enable control. Cross-role Agent links and AccountNotifications retain their existing placement and behavior.

Only the current authorization request is shown. A pending switch request ID takes precedence over the source credential's request ID. The existing API does not supply arbitrary historical request ordering; missing current request data renders no inferred approval. OAuthGrants remains a distinct authorization-history renderer in advanced connection management, never an SRC account Row or an SRC L2 history surface.

AccountsPage's mixed SRC/AGENT account list and account-wide maintenance remain shared account compositions. They are not converted into a source chosen from the first associated record. Notification binding and account-store reconciliation are outside object extraction.

**Fixtures.** `src-tunnel-light`, `src-tunnel-dark` and `src-tunnel-narrow` mount the real object variants with fixed records, privacy, busy/retained-data error, revoked/missing identity, identity conflict, pending switch, absent address, unknown product and disconnected/error states. Keyboard checks distinguish row and connection targets and explicit mutation selection. `src-account-multiple` opens the real grouped SourcePanel with a current authorization and an older grant. Existing source-panel, accounts, topology, setup and switch fixtures cover the migrated hosts.

## AGENT platform

| Implementation and callers | Form; rendered data | States |
| --- | --- | --- |
| `ConnectionOverview::agentViews` → `GraphNode`; `accountViews` platform parent | Node; Agent name, `AgentQuotaIcon`, conditional task count/attention, auto-compact label; account parent suppresses quota with `quota={null}`. | installed+enabled nodes only; preparing/failed adapter; Codex desktop/app-server ready/connecting/error; other Agent ready/available/error; selection/reorder and task attention. |
| `AgentsSettings::AgentCard` and its inline children (`ui/components/AgentsSettings.tsx`); called by `ConnectionOverview` | Card; logo/quota, name/official link, compact version, enabled switch, adapter message. `AgentCard` itself owns reorder/layout, not all business content. | installed/enabled, unavailable enabled value, loading/saving, preparing/failed/missing adapter; reorder only installed+enabled, errors. |
| Uninstalled links in `AgentsSettings` | Mixed compact tiles; logo + name/official setup link. | not installed; link error. No version, switch, secondary line or status dot. |
| `AgentDetails` in `AgentsSettings`; called by `AgentsSettings` | Mixed summary Card/dialog; icon, name, version/not-installed, optional official link, discovery error, `QuotaBubble`. | installed/not installed/unknown, discovery failure, quota present/absent. |
| `AgentPanel::AgentView` (`ui/components/AgentPanel.tsx`); called by `AgentPanel` from `ConnectionOverview` | Mixed Card/workspace; logo with dual quota, name, version, in-progress count, native Open/settings/width actions, quota and conversations. | active/hidden, runtime disconnection announcement, provider/action errors, refreshing, quota absent; native Open requires installed and non-Linux host. |
| Agent-name/icon references in `ActivityTimeline` and `TimelineEntries::ProcessEntry`; Codex/Claude environment rows in `PermissionsPage`, readiness in `Onboarding` | Mixed inline identity/Row; task back navigation and reply icon; permission label/use/badge/actions. | permission granted/missing/unknown/not-applicable, busy/platform constraints. Permission state is not Agent discovery state. |

**Data.** `Agent` is in `ui/state/agents.ts`: `agent`, `displayName`/builtin name, `version`, `installed`, `enabled`, `adapter.{state,error}`, `discoveryError` are displayed or directly determine visible controls/messages. `available`/`status` determine homepage wire state. `protocol` and `descriptor.{command,args,compatibility.caveats,compatibility.sources}` have no dedicated display in these views; official links use `agentLinks` derived from builtins, not the live descriptor. AgentPanel adds `Status.platform`, `Status.core.desktop.state`, `Status.core.appServer.state`, activity counts and subscription data.

**Duplication and gaps.** Node uses a single ring while panel uses dual rings; settings Card has enablement/adapter failure, details has discovery error, panel has version/activity/actions. Version/identity headers are independently assembled. No full platform Chip or reusable platform Row exists; permission rows and uninstalled tiles are contextual fragments. Node and parallel summary Cards exist.

**Fixtures.** Homepage and `topology-accounts` show Nodes. `right-panel` and `agent-panel*` show AgentView. No dedicated initial scenario shows AgentsSettings/AgentDetails, uninstalled Agents, adapter failure or discovery errors.

## AGENT account / profile

| Implementation and callers | Form; rendered data | States |
| --- | --- | --- |
| `accountViews` right-side children → `GraphNode`; called by `ConnectionOverview` | Node; account alias or platform + alias, per-account quota icon; single account stays on base platform Node. | selected, shared identity, tree/flat/collapse; attention from attributed tasks. Wire state inherits platform state, not profile signed-in state. |
| Shared `AccountsPage` list and `AccountDetail` | Row / mixed Card; same provider-account identity as SRC, AGENT role tag, attention indicator; profile name, state, kind, default switch and reauth action inside Agent role card. | signed-in/signed-out/unfinished/invalid; default/nondefault; busy, disabled default or unsigned profile, empty role, privacy, remove/merge/error. |
| `AgentPanel::AgentView` with `account`/`accountId` | Mixed account Card/workspace; account alias replaces platform name, account quota replaces platform quota; filters activity/history by current or merged account IDs. | account missing, no quota, empty/loading/error conversations, refreshing. No email, org, plan, profile kind/default/login state in this header. |
| Agent-role links in `SourcePanel` | Partial Chip-like links; Agent name + account alias, Open Agent panel action and shared-quota notice. | present only when profiles exist; no state dot, no signed-in state. |
| `AddAccount` (`ui/components/AddAccount.tsx`); called by `AccountsPage` | Mixed login/editor; kind/browser choices, login state and URL action, identity email/org, alias, profile Agent name/default/state; detected options use alias only. | starting/waiting/completed/unfinished and other returned login states; detect none/multiple; native-auth guidance, identity mismatch/unresolved/matched, browser/login/field errors, busy, privacy. |
| `MergeAccounts` (`ui/components/MergeAccounts.tsx`); called by `AccountDetail` | Mixed selection/editor; account aliases, SRC/AGENT roles, alias editor, quota provider names. | selected members, busy/error, native/shared provider choice. No account health or profile status in candidate list. |

**Data.** Shared `ProviderAccount` fields and non-displayed fields are listed under SRC account. `AccountAgentProfile` (`ui/types.ts`) displays `agent` (resolved name), `state`, `kind`, `default` in AccountDetail; `profileId` has no visible display. `AccountLogin` displays `state`, `browserError`, `error`, `errors`, `next.message`; `kind` selects the flow, `loginUrl` is copyable, and `browserId` selects a browser. `loginId` and `accountId` route requests, not visible facts. `AccountIdentity` is declared in `ui/types.ts` but has no direct component renderer; account views consume `ProviderAccount` instead.

**Duplication and gaps.** Provider-account list, profile role card and account AgentView represent different levels: whole account, one profile, account-filtered platform workspace. Only profile role entries show login/default state; only shared account detail shows email/org/plan; topology inherits platform health. Full Chip is missing. Node/Row exist with the noted identity distinctions; Card is mixed and repeated across account detail and AgentView, not a dedicated profile summary.

**Fixtures.** `topology-accounts` shows Node attribution and account panels after selection. `accounts` supplies signed-in/signed-out/unfinished/default roles and interactive add/merge/reauth. No dedicated initial fixture opens account AgentView, merge, invalid-profile or login-error states.

## TUNNEL / connection / ingress

`ui/components/objects/tunnel/` exports `TunnelChip`, `TunnelNode`, `TunnelRow` and `TunnelCard`. `sourcePresentation.ts::ingressState` is the existing pure transport projector; object components apply the common state presentation map after projection.

| Component / callers | Rendered data and boundary |
| --- | --- |
| Chip / source Rows, SrcAccountCard | Connection name, kind and projected state. A valid explicit callback opens connection detail. Removed connections are text. |
| Node / Topology, browser and design mounts | Non-clickable SVG host for the existing TopologyPainter and PortraitPainter. Live layout/animation remain in Topology; standalone mounts accept a typed projected frame and invoke the same painters. Both consume the same semantic wire-state mapping without changing path geometry, colors or orientation behavior. No Ingress-to-edge correspondence is invented. |
| Row / RemoteLinkPage, AddControlSource, ChangeConnection, PermissionsPage | Name, kind, source count from the supplied collection, masked URL/provider or eligibility constraint, and projected readiness. SingleChoice wraps static Rows for selection. Permission verification remains a separate host-owned badge. |
| Card / RemoteLinkPage detail, AddConnection success, IngressDetailsDialog, HostedRelay | Name, kind/provider, state, masked address/copy, errors, carried-source count, Relay owner/worker-version facts. Header/body/footer/danger slots retain host-owned actions and source Rows. Missing Ingress may retain an actual Relay identity, with unknown transport state. |

SourceConnection no longer embeds a second connection summary or address editor: it uses the connection Chip in the SRC Card. SourcePanel no longer changes connection enabled state. Remote connection detail retains the existing enable mutation with busy/error handling. Setup follow-up actions, advanced credentials/policy/grant management, Relay member/invite administration and deployment jobs stay in their existing containers. Existing panel placement and connection editor entry points are unchanged.

**Omitted facts.** Raw IDs, discovered URLs, verification times, tool policy, credential flags/secrets and provider configuration internals are not object Card facts. Config/provider editors retain those fields where needed. A failed transport does not revoke its carried sources.

**Fixtures.** The `src-tunnel-*` mounts cover references, rows, Cards and both existing wire painters, including error/connecting frames. Existing `p3-connection-detail-*`, `p3-connection-ready-*`, `p3-source-connection-*`, `p4-switch-connection-*`, `debt-permissions-*` and `debt-relay-hosting-*` cover current host contexts. Native connection lifecycle and real delivery are not established by browser fixtures.

## TASK

| Implementation and callers | Form; rendered data | States |
| --- | --- | --- |
| `objects/task/Chip.tsx` / TaskChip | Inline activity, conversation or receipt title and the corresponding projected state. Standalone/design reference; no invented destination. | Selected/attention/disabled, missing title, known/unknown state. |
| `objects/task/Node.tsx` / TaskNode via `ActivityBubble`; content in `objects/task/Content.tsx`, also used by display-settings preview | Node; original title, phase/interaction headline, elapsed duration, unread/pending, project, DispatchSpec, source icon and recent steps. Detailed adds prior content/duration/source name. | Original densities, running/completed/unread/read, attention, external transcript, update-blocking, reorder and topology anchors. Owner retains navigation and mark-read. |
| Inline activity-summary button in `ConnectionOverview` | Aggregate queue control; hidden count, phase icon and View all. Not one TASK. | Existing overflow/collapse/expansion and path attribution. |
| TaskRow (`objects/task/Row.tsx`) in `AgentConversations` | Activity Row; shared bubble content, historical date/project/turn count. `projection.ts` converts AgentConversation explicitly before the host merges observed activity. | Host retains account filtering, attention/running/unread/date sections, loading/error/retry/empty and pagination. Historical rows omit the live headline. |
| TaskRow in `TasksPage` | Receipt Row; title, project basename, running state, creation date, prompt preview and recorded DispatchSpec. | Selected/unknown/stale/archived/error/approval state projection; collection loading and errors stay in the page. |
| TaskRow in `SourceDispatches` | Dispatch Row; title, phase icon, Agent, dispatch state and recorded DispatchSpec. | Pending/running/completed/failed/unknown; no open action without live or fresh runtime evidence. Host retains source filtering, current-dispatch association, counts and pagination. |
| TaskCard (`objects/task/Card.tsx`) in `ActivityTimeline` and `TasksPage` | Shared detail header/frame: title/project/state, DispatchSpec, source Chip, ownership, duration and turn progress. Back/native-open/width/close actions are callbacks. | Timeline root/ref, scroll, requests, review, read-only/partial coverage and retry/resume remain with ActivityTimeline. Receipt prompts/copy/admission remain bound to their original TaskRecords in TasksPage. Dialog retains focus and Escape ownership. |
| `TimelineEntries`, `TaskOutcome`, `TaskChanges`, `TaskQueuedMessages` | Retained timeline/turn body compositions: prompt, reply, tools, plan, files/diffs, durations, requests, outcomes and queued input. | Existing disclosure, streaming, error, truncation, review and interaction semantics. Queued inputs are not peer messages. |
| TaskRow in `AppUpdate::WorkItem` when a live task resolves | Activity Row with native task projection; owner navigates. Unresolved/non-task work retains title/count. | Blocking/willResume/unaffected/stale grouping and LiveInteractionRequestCard remain owned by updates. |

**Data.** `AgentActivitySession`, `AgentConversation`, `AgentTimeline`, `AgentTimelineEntry`, `DispatchSummary`, `TaskOwnership` are in `ui/types.ts`; `TrackedActivity` is in `ui/state/activityModel.ts`; `TaskRecord`/`TaskRuntime` in `ui/state/tasks.ts`.

| Type | Actually displayed or projected | Available but not displayed as dedicated facts |
| --- | --- | --- |
| `AgentActivitySession` / `TrackedActivity` | title, phase, headline/fallbackHeadline, interaction, project/projectName, recentContent/steps, startedAt/turnStartedAt, turnCount, dispatch model/effort/priority/source label; endedAt/readAt drive completion/unread | IDs, turnId, nativeSessionId, origin ingress/source/account IDs, agentAccountId, phaseSince, orderAt; source/timeline/open route behavior rather than raw values. |
| `AgentConversation` / page | title, project/name, createdAt, turnCount, dispatch fields, status as paused/history state | id/nativeSessionId/open and source route actions; nextCursor/scope have no visible raw display. |
| `TaskRecord` / `TaskRuntime` | task title/prompt/project/directory/model/effort/kind; createdAt; approval decision/source; error.message; runtime title/project/status/archived/stale; sourceLabel and ownership in detail/history | request/task/thread/turn IDs, executionOwner, updatedAt, approval.at, task.input/settings/detailsRecorded, raw origin IDs, runtime.observedAt. IDs can be fallback/navigation data. |
| `AgentTimeline` | status, entries, projectName, dispatch summary, ownership/history, turnStatuses, turnTimings; coverage partial/truncated affect presentation | sessionId/cursor, coverage.reason, executionEvidence; readOnly only gates actions. `turnDispatchSummaries` is consumed for routing/review attribution, not rendered as a per-turn model/source strip by TimelineEntries. |
| `AgentTimelineEntry` | type/status, text/title, command/cwd/path, input/output text and truncation, exitCode, plan content/status, changes/diffs/counts, interaction/response, source, start/end/duration timing | raw id/turnId/cursor/position/updatedAt, exitCodeSource, excerpt state/sha256/hashScope, plan.priority, commandActions. Operation feeds file/change presentation rather than a general raw metadata panel. |
| `TaskOwnership`, `QueuedMessage`, `UpdateWork` | owner/currentOwner, handoff from/to/observedAt; queued text/preview/state/error; update title/kind fallback/count | ownership state/top-level observedAt/eventId; queueId/threadId/reason; update turnId/owner/reason/question payload (controls use live session instead). |

**Convergence.** Three list hosts share TaskRow with explicit source kinds; their density and evidence differences are intentional. ActivityBubble is a live adapter around TaskNode, not a parallel renderer. TaskCard shares the summary header and framing while preserving body ownership. DispatchSpec remains the sole recorded model/effort/tier renderer, including shortened brand prefixes and Claude Code specs. Task ownership remains its existing popover composition.

**Fixtures.** `task-objects-light/dark/narrow` cover all four variants, keyboard/reorder/read callbacks, retained errors, busy/disabled actions, stale/unknown/failed receipts, interrupted history, secret response masking and recorded-turn specifications. Existing bubble/homepage, `agent-panel*`, `source-panel`, `debt-tasks-*`, task-detail and update scenarios retain real-host coverage. No native or browser acceptance is implied by adding these mounts. Peer messages and panel relocation remain deferred.

## Interaction request: execution question / approval

| Implementation and callers | Form; rendered data | States and limitations |
| --- | --- | --- |
| ActivityBubbleContent / Headline; TaskRow reuse | Mixed TASK Node/Row fragment; summary, pending/attention phase and elapsed time. | Request present/absent; no standalone request node identity or independent actions. |
| `TaskNeedsYou` (`ui/components/TaskNeedsYou.tsx`); called by `ActivityTimeline` | Card-like dock, or banner + sheet; count/pager, summary; permission title/command/preview/path/cwd/reason; question form; routing. | multiple requests, wide dock/narrow banner-sheet, active request focus/drafts, no request returns null; unsupported/resolved/submitted filtered by `pendingSessions`. |
| `InteractionRequestCard` and live adapter (`ui/components/objects/interaction-request/`); TaskNeedsYou and AppUpdate | RequestCard composition; context, question fields or permission actions, state/error and footer. | Single/multiple/custom/secret input; unsupported/read-only, submitting/pending/submitted/failed/unconfirmed; disabled bypass; both hosts include permission context. |
| `InteractionRequestRow` and live adapter; TimelineEntries | EntityRow; question/approval summary, verdict, protected answer and response origin. | Pending/resolved elsewhere/answered/skipped/approved/rejected; secret history stays masked. |
| `InteractionRequestChip`; request fixture/design exports | Inline reference; title/summary and submission state. | Optional review callback only, never a response action. |
| `TaskReceiptHistory` in TaskNeedsYou; called by TimelineEntries; TasksPage receipt sections | Row / mixed detail; TaskRecord approval verdict, task title/prompt and approving source. | approved/bypass/reject history; TasksPage additionally offers awaiting-approval approve/reject. These are dispatch admission receipts, distinct from native execution permission requests. |
| `RequestRouting` (`ui/components/RequestRouting.tsx`); called by TaskNeedsYou (dock and narrow footer) | Mixed request-footer fragment; source label, countdown, pause/resume/handoff. | deferred/paused/routed/not-routable, busy, omitted on read error; announcements differ from ticking display. |

**Data.** `AgentInteraction` (`ui/types.ts`) displays `summary`, `title`, `command`, `path`, `preview`, `cwd`, `reason`, normalized `questions.{question,options.label,options.description,isOther,isSecret,multiSelect}` and legacy `options`. Question IDs key answers. `kind`, `method`, `canRespond` and `respond.{op,args}` determine supported actions. `respond.via`/`hint` and raw operation/argument metadata have no dedicated UI. `ApprovalSubmission` (`ui/state/activityModel.ts`) shows status/error/decision outcome; payload is not printed, except answer extracted for history. `AgentTimelineEntry.response` shows result/skipped/origin sourceLabel/controlSource; resolvedAt/sourceId are not printed. `RequestRouting` (`ui/state/requestRouting.ts`) displays state and deferUntil-derived countdown; pausedBy/reason are not shown.

**Composition.** RequestCard shares framing only. Execution response and OAuth decision adapters retain separate data and action contracts. TaskNeedsYou owns routing and sheet/draft state; AppUpdate resolves the current live request. TasksPage's dispatch admission controls remain distinct from native execution requests.

**Fixtures.** `approval`, `bubbles-pending`, `timeline-pending`, `task-long-approval`, `task-long-question`, `task-actions`, `task-routing-*`; update work fixtures when live sessions match. No dedicated initial fixture exhaustively covers unsupported, failed/unconfirmed submission, secret/multiple question or multi-request pager states.

## Peer message / coordination message

There is no peer-message TypeScript model, store, named component, inline specialized renderer, or fixture in `ui/`. None of Chip, Node, Row or Card exists. `ui/types.ts::AgentTimelineEntry.type` has user/text/thinking/command/file/tool/plan/interaction/error, without a peer/coordination variant.

`TimelineEntries::UserMessage`/`ProcessEntry`, `TimelineMarkdown` and `TaskQueuedMessages` render ordinary task text/input; they do not present coordination sender, recipient, delivery or read state. Upstream coordination text could appear as generic text, but that does not establish a peer-message implementation. The variable named `peer` in `ui/scenarios.ts` is another ControlSource fixture, not a coordination message. No peer-specific rendered or undisplayed field set can be enumerated without a UI type.

## Quota: cross-object composite

| Implementation and callers | Form; rendered data | States |
| --- | --- | --- |
| `AgentQuotaIcon`, local `TimeTick` in `ui/subscriptions/QuotaRing.tsx`; callers ConnectionOverview, accountViews, AgentView, AgentsSettings/AgentDetails | Node/icon composite; Agent logo, selected display window single ring or short/weekly dual rings, percentage/window accessible label and timing tick. | enabled eligible platform provider; explicit account quota or null logo-only; ready/stale, expired windows omitted, unknown/no quota; remaining/used. No explicit quota error notice. |
| Default `QuotaRing`, `ActivityArc` in same file | Partial Chip/dial with optional numeric percentage, brand image, timing and running/attention arc. **No JSX caller in `ui/` for QuotaRing**; ActivityArc is called only by QuotaRing. | stale, running/busy/attention, unknown selected window, used/remaining. Retained implementation does not establish a mounted Chip. |
| `AgentQuota` (`ui/components/AgentQuota.tsx`); callers AgentView and `AccountQuota` | Card; up to short/weekly windows or first two finite windows, reset/age, refresh, percentage, pace warning/track/tick, credit/reset extras. | no windows → no-quota text; refreshing/ineligible, unknown reset/time/age, used/remaining and countdown/time preference; pace warning. Provider errors are handled separately by AgentView, not by AgentQuota. |
| `AccountQuota` (`ui/components/AccountCards.tsx`); callers AccountDetail and SourcePanel | Card adapter reusing AgentQuota; `accountQuotaProvider` (`ui/subscriptions/accountQuota.ts`) projects account quota. | local refresh state and empty quota; account errors map state to unavailable but error details are not forwarded. |
| `QuotaBubble` (`ui/subscriptions/QuotaBubble.tsx`); callers AgentDetails and `UsageOverview` | Card; provider/plan/link/icon, all windows/reset/percent/pace, age/refresh, credit/reset details, product usage segments, notices. UsageOverview wraps eligible enabled providers in scroll cards. | ready/stale/unavailable/blocked/exhausted, raw shared-usage error, refresh/link error, ineligible, hover/focus disclosure; privacy protects notice strings. Empty/loading/read error in overview. |
| `UsageHistory`, `ResetCreditDetails` (`ui/subscriptions/UsageHistory.tsx`, `ui/subscriptions/ResetCreditDetails.tsx`); called by QuotaBubble and AgentQuota | Mixed disclosure and detail rows; reset count and expiry or unknown expiry. | hover/focus/expanded, unknown/expired credit; not an independent provider quota Row. |

**Data.** `ProviderSnapshot`/`QuotaWindow` are in `ui/subscriptions/types.ts`; account subset is `ProviderAccount.quota` in `ui/types.ts`. Rendered: provider name/agent brand/plan, state/refreshing/error, observedAt, windows label/scope/usedPercent/resetsAt/exhausted, selected display window, accountBlocked/blockedPoolIds, creditBalance/availableResetCount/resetCredits, productUsage basis/shared/rows, rawUsage.sharedUsageError. IDs/pool IDs associate selection, labels, periods and blocking; eligible/agentIds/settings gate inclusion. Cursor rawUsage billing-cycle dates contribute to inferred period (`ui/subscriptions/quotaTiming.ts`). `source`, `lastAttemptAt`, hasCredential/acceptsKey/credentialSource, other rawUsage data and error.retryAt have no dedicated display; error code is translated rather than printed as a separate fact. No dedicated row shows account quota error metadata/observation independently of its projection.

**Duplication and gaps.** AgentQuota limits windows and places refresh with a summary window; QuotaBubble shows every window and richer notices/product usage/link/plan. Both retain their tracks, pacing and reset extras; Freshness shares observation/refresh framing. Ring/tick implementations differ from Card tracks; single/dual rings also differ. AccountQuota shares AgentQuota rather than duplicating its renderer. A mounted full Chip and standalone quota Row are missing; Node overlay and duplicated Cards exist. The unmounted QuotaRing is only a partial Chip candidate.

**Fixtures.** `agent-panel`, `agent-panel-empty`, `agent-panel-used`, `agent-panel-no-quota` show panel quota presence/preferences; `topology-accounts` shows per-account rings/quotas. QuotaBubble/UsageOverview requires opening Agent settings/details; no dedicated initial fixture shows its product usage, credit/reset, blocked, stale or error families. Account quota is reachable from `accounts`/`source-panel` account tab, subject to account reads.

## Homepage structure

These are structural compositions, not four density variants of domain records.

| Structure | Implementation / callers / data | States, duplication and fixtures |
| --- | --- | --- |
| Hub | `ui/topology/Hub.tsx::Hub`, passed as `Topology.brand` by ConnectionOverview: sourceEmpty/agentEmpty booleans and add/manage callbacks; ARC mark plus two earcup actions. ConnectionOverview independently renders the global connection power switch using ingress running/starting/stopping and connector loading/busy/error. | empty/add versus manage, onboarding-hidden, switch on/off/busy/disabled; custom switch instead of shared Switch. No other hub implementation. Homepage sets; `idle` does not empty both sides; `p3-welcome-*` hides/inerts the underlying home surface. |
| Topology line | `TopologyPainter` / `PortraitPainter`, driven by Topology + animator/solve. Data: projected NodeView/TaskView/PaintNode/PaintTask and geometry, no ingress endpoint/transport metadata. | Two orientation renderers, path highlights, collapse/selection, running/attention/completed/external/summary task paths and panel bridges; homepage sets, especially `topology-accounts`, `narrow-tentacles`, `task-queue-overflow`. No fixture directly sets a transport-error wire. |
| Dock item | Inline `App` page-button map in `ui/App.tsx`: Page id/label/Lucide icon, awaiting-approval count for Tasks; `UpdateDock` (`ui/components/AppUpdate.tsx`) separately renders update icon/progress/popover via update store. | page/modal/welcome inert or hidden; pending count; update available/downloading/outcome states. No exported common DockItem. Standard page items have page navigation; update item has update-specific behavior. Homepage sets and `updates-available`, `updates-downloading`, `updates-succeeded`, other update fixtures. |

## Primitives and recurring presentation blocks

Primitives take presentation props rather than domain objects. Chip/Node/Row/Card gaps do not apply to buttons or status indicators; domain-specific usage is listed above. They have no additional hidden business fields.

| Primitive | Existing implementation, callers and rendered props | States / parallel forms / fixture coverage |
| --- | --- | --- |
| Status pill | StateBadge wraps Status for dot labels and renders compact/icon or dot-only presentations from the domain map. | Unknown states are neutral. Notification binding and audit outcome Status callers remain outside the map. |
| Switch | Shared Radix `Switch` in `ui/components/ui/index.tsx`; SourcePanel, AccountsPage, AgentsSettings, AgentDisplaySettings, SettingsPage, SettingsExtras, UpdatesSettings. checked/label/id/disabled. | on/off/disabled/focus; homepage power switch is custom, includes spinner and async connection meaning. Task/profile/connection fixtures exercise contextual controls, not every switch state. |
| Buttons | `Button`, `IconButton` in UI index; used throughout product views. Button children/native props, variant and busy; IconButton icon/label/size. | primary/secondary/ghost/link/danger/danger-outline, disabled/busy, accessible label; GraphNode, ActivityBubble, ConversationRow, source dispatch, task-document, dock and hub use specialized native buttons. Covered across fixtures, no exhaustive primitive matrix. |
| Section header with actions | `SectionHeader` in `ui/components/ui/Shells.tsx`: explicit heading level, title/count, leading/back/close/width slots, secondary content and trailing actions. | Callers retain busy/disabled controls and Dialog focus ownership. Panel and `shells-*` fixtures cover composition. |
| Empty state | `Empty` in UI index: children/action/icon; callers TasksPage, AgentConversations, AccountsPage, RemoteLinkPage, OAuthGrants, UsageOverview. Several views instead use muted paragraphs (SourceDispatches, AgentQuota, account roles, connection sources, RelayHosting, timeline). | empty versus loading/error; action/icon optional. `accounts`, `agent-panel-empty`, `p3-source-empty-*`, `p3-welcome-*` cover contextual absence, not all empty renderers. |
| Error state / notice | `Notice` and `LoadingIndicator` remain the shared feedback renderers. Unused ErrorCallout markup and CSS are removed. | Field and task errors retain their domain-specific handling; no universal fetch wrapper. |
| Loading | `Loading` in UI index (spinner + label), `LoadingIndicator` in Feedback (spinner with accessible label, used by ActivityTimeline); busy buttons and inline loading paragraphs also exist. | loading/busy, sometimes retained content; agent/task/connection progress fixtures, no initial transport-fetch-error/loading suite. |
| Avatar / platform icon | `PlatformIcon` in `ui/components/ui/PlatformIcon.tsx` resolves source/agent/provider artwork, fallback and add state. AccountAvatar remains the account-role adapter; AgentQuotaIcon remains the quota composite. | Decorative artwork has no duplicate accessible name. No alias-initial badge. `shells-*`, homepage, account and quota fixtures. |
| Privacy | Sensitive, SensitiveIdentity, SensitiveInput and PrivacyToggle keep the existing privacy policy. Address owns clipboard feedback and passes controlled values/callbacks to AddressField. | Copy uses raw values only on explicit action; missing values disable copy. `shells-*` and existing account/setup fixtures. |

## Object × variant summary

`*` marks a partial or mixed implementation, with the missing part explained above. “Duplicated” means parallel render blocks for the same effective form, not a merge recommendation. Shared renderers are named once even when several callers use them.

| Object | Chip | Node | Row | Card |
| --- | --- | --- | --- | --- |
| SRC platform | SrcPlatformChip | SrcPlatformNode | SrcPlatformRow inside SingleChoice or browse | SrcPlatformCard (mounts; placement deferred) |
| SRC account / control source | SrcAccountChip | SrcAccountNode | SrcAccountRow | SrcAccountCard; mixed account maintenance stays in AccountsPage |
| AGENT platform | missing | GraphNode + agentViews/accountViews | missing (permission/context fragments only) | duplicated: AgentsSettings AgentCard, AgentDetails*, AgentView* |
| AGENT account / profile | missing (SourcePanel role links lack state) | GraphNode + accountViews | duplicated: shared AccountsPage row, AccountDetail profile entry* | duplicated: AccountDetail*, account AgentView* |
| TUNNEL | TunnelChip | TunnelNode + existing projected painters | TunnelRow | TunnelCard |
| TASK | TaskChip | TaskNode via ActivityBubble | TaskRow (activity, receipt, dispatch); resolved update work | TaskCard in ActivityTimeline and TasksPage |
| Interaction request | InteractionRequestChip | N/A (TASK owns attention) | InteractionRequestRow, AdmissionRequestRow | InteractionRequestCard + live adapter |
| Authorization request | AuthorizationRequestChip, SourceAuthorizationChip adapter | N/A | AuthorizationRequestRow | AuthorizationRequestCard + ApprovalCard adapter |
| Deployment progress | DeploymentProgressChip | N/A | N/A | DeploymentProgressCard |
| Relay member | N/A | N/A | RelayMemberRow | RelayMemberCard |
| Peer message | missing | missing | missing | missing |
| Quota | missing (unmounted QuotaRing is partial) | AgentQuotaIcon* | missing (window/reset detail rows only) | duplicated: AgentQuota (AccountQuota adapter), QuotaBubble |

## Other recurring patterns: suggestions only

- **Authorization request.** Shared Card and separate OAuth adapter cover setup/switch/claim flows. SourceAuthorizationChip exposes only current bound authorization evidence; its SRC host attachment is owned by the SRC/TUNNEL migration.
- **Suggestion: notification binding/session.** AccountNotifications contains target identity, reachability, last-delivery evidence, bind and test actions beyond a generic account status.
- **Suggestion: conversation/turn/dispatch receipt.** TaskRow adapters and task turns render related work at different levels with different state authority.
- **Suggestion: execution owner/handoff and queued input.** TaskOwnership and TaskQueuedMessages already have distinct models, actions/state and presentation needs.
- **Suggestion: quota window/pool, reset credit and product-usage segment.** These repeat within both quota Cards and rings and have independent timing/blocked/expiry semantics.
- **Hosted relay member and lifecycle job.** RelayMember Row/Card and DeploymentProgress Chip/Card are implemented; polling, ownership and mutations remain with their existing hosts.
- **Suggestion: update job/work impact.** AppUpdate has update identity, work groups, consequences, schedule and outcome beyond a navigation item.
- **Decided (user, 2026-10-26): dispatch spec Chip.** Model, reasoning effort and service tier (Fast) form one Chip component. It reads the dispatch record of the current task or turn itself and formats it per agent. Known bug it must fix: the homepage task bubble shows a raw dsh model ID such as `["magpie","opencode-go/deepseek-v4.1-flash"] · max`; it should show the agent's own readable model label (e.g. `DeepSeek V4.1 Flash · OpenCode Go · Max`).
- **Suggestion: common presentation blocks.** Section header with actions/count, source provenance, execution spec, phase tile/trail, file/change/diff disclosure, and loading/error/empty compositions recur with different implementations. Their current duplication does not decide which implementations should be merged.
