# Component system specification

MUST means a requirement. SHOULD means the default unless a concrete task-specific reason justifies an exception. MAY means an option.

The shell layer and domain state presentation map are implemented in the current hosts. SRC platform, SRC account, AGENT platform, AGENT account, TUNNEL, TASK, interaction request, authorization request, relay member and deployment progress objects, together with RequestCard, are implemented. Other object contracts below describe their respective convergence state. [Component inventory](component-inventory.md) records current renderers; [Object model](object-model.md) supplies the draft management placement. Component reuse does not itself authorize that draft's page removals or backend changes.

## Boundaries and composition

The system has three composition layers above the shadcn primitive foundation: object-agnostic shells, object components, and cross-object composites. Each object has exactly four named variant slots: **Chip / Node / Row / Card**. N/A means no real use has been identified; it does not require an empty component or export. Bubble density is a TASK Node preference, not another object variant. TUNNEL Node is a topology line, never a new graph vertex.

Object adapters MUST use current types and existing domain projections. A ProviderAccount is not a ControlSource, an AccountAgentProfile is not an Agent, and an activity session is not a dispatch receipt. Adapters MUST retain those distinctions. Internal renderers can be replaced directly once callers converge; no legacy aliases or parallel renderer APIs are required. Frozen MCP, notification, CLI and wire contracts are outside this work.

Notification binding is deferred. This specification neither extracts AccountNotifications nor relocates its binding, test or delivery UI. Quota retains the mature AgentQuota/QuotaBubble design. Topology retains its geometry, earcup connections, motion and accessibility behavior.

For CLI installation, the semantic token map and build integration, see [UI foundation](ui.md#shadcn-and-tailwind-foundation). `ui/components/ui` owns copied primitives and domain-neutral adapters; it does not own domain fetching or page state.

## 1. Shells

Shells accept presentation values and callbacks, never domain records or stores. They do not fetch, navigate or mutate independently. Copied shadcn/ui primitives, Tailwind v4, semantic tokens and Icon form the foundation. Radix owns interaction behavior; shells compose those primitives and utility classes. Shared shells, forms, RequestCard, DispatchSpec, HoverPreviewGroup and AnimatedSize use Tailwind utilities without dedicated CSS. ElasticPanel composes the shadcn Dialog surface and retains geometry, layered Escape and focus restoration. App owns the workspace title bar and dock; nested views retain their scrolling boundaries and switch without shell morphing. Public adapter props remain stable for existing feature owners.

| Shell | Contract | Consolidates |
| --- | --- | --- |
| PlatformIcon | Platform key, explicit `source` / `agent` / `provider` role, size, optional quota-ring slot, fallback and add state. One asset resolver retains existing brand assets; role disambiguates product/vendor/Agent IDs. Unknown brands use the role fallback; add uses Plus. Decorative images have no duplicate accessible name; a meaningful quota slot supplies its own label. No alias-initial/person-avatar inference. | SourceIcon, AccountIdentityIcon's brand selection, AgentQuotaIcon's logo branch, subscription brandIcon/image branches and inline Agent logos. The quota ring itself remains a composite. |
| StateBadge | Receives one mapped tone, localized label key and icon from the domain map below. Supports dot/compact presentation with an accessible label. It does not infer state from color, errors or arbitrary strings. | Status compositions, permission badge, task-state and independent state dots; Status may remain the underlying primitive. |
| SectionHeader | Title, optional count, trailing actions, optional back/close/width controls, explicit heading level. Controls retain labels, keyboard access and busy/disabled states. Width is an action/state of the containing panel, not domain data. | Independent panel/section heading layouts; Dialog continues to own focus and overlays. |
| EntityRow | Leading icon, title, at most one secondary line, trailing state and actions, optional chevron/link. Navigation and action targets remain separate; no nested buttons. Selection and warning attention are explicit. Icons and copy remain side by side. | Source/account/connection/conversation/permission row framing; domain-specific contents stay in objects. |
| EntityCard | Icon/title/header actions, body, optional footer and danger zone. A Card is content, not an extra modal or a second canonical inspector. Body clicks do nothing by default. The outline variant groups facts without a surface fill. | Repeated account, connection, catalog and summary framing. |
| FactList | Ordered label/value pairs, optional link/copy value slots, explicit missing-value policy. Uses semantic term/value markup. No inferred fields, decorative descriptions or automatic JSON dump. | Repeated detail facts and identity summaries. |
| Freshness | Observation timestamp, relative age, refresh callback, busy/disabled, unknown time. Caller supplies clock and stale state. Refresh preserves readable content; fetch errors remain separate from domain state. | Quota age/refresh and last-seen presentations. |
| AddressField | Label, raw value, masked display, explicit reveal/copy, loading/disabled and copy error. Copy uses the raw value only on an explicit action. Missing value has no enabled copy action. | CopyField/address fragments; reuse Sensitive and existing privacy policy. |
| SettingsSection / SettingRow | One section heading with optional description; aligned label/description and trailing control. Navigation alone has a chevron and a content-sized HoverScope target. Ordinary control rows never highlight. | SettingsPage, SettingsExtras, AppUpdate/UpdatesSettings, AgentDisplaySettings and Agent settings rows. Do not repeat the section title as its only child label. |
| FormField / FormSection | Label, control, help and error in vertical order; descriptive IDs associate direct controls. Semantic fieldsets group fields inside native forms. Owners validate and focus the first invalid control. | Settings proxy form, IngressDialog and SourceConnection advanced fields. |
| ActionGroup | Standard token gap, leading/trailing alignment and narrow-width wrapping. | Settings update buttons, form actions and Agent settings header controls. |
| Disclosure | Radix collapsible, button with chevron, aria-expanded/controls, controlled or local open state, disabled and reduced motion. | SourceConnection and IngressDialog advanced sections. |
| DangerZone | End-of-panel destructive actions with one concise consequence; confirmation and actions remain owner-controlled. | SourceConnection disconnect and IngressDialog removal areas. |
| ChoiceControl | Same presentation inputs as SingleChoice; zero or one option is a static current value, multiple options delegate to SingleChoice. Missing values use an em dash. No automatic selection or mutation. | SettingsPage, SettingsExtras, AgentDisplaySettings, UpdatesSettings and IngressDialog. |
| Existing primitives | Button, IconButton, Switch, Notice, Empty and Loading keep their existing contracts. ChoiceControl wraps SingleChoice for settings: zero or one option renders a static current value; it never silently substitutes an unselected option. SingleChoice remains interactive for flows that require explicit selection, such as Relay account recovery. Dialog, Field/Input, menus and privacy helpers are reused as needed. | No redesign. Homepage async power behavior remains in its adapter while reusing Switch when converged. |

### Shell implementation and mounts

Import shells from `ui/components/ui`. `PlatformIcon.tsx` owns role-aware asset resolution; `Shells.tsx` owns the original presentation contracts; `Forms.tsx` owns settings, form, disclosure and action layout. Domain adapters call `objects/statePresentation.ts` after the existing projector. Notification binding and audit-record outcomes retain their separate primitives because they are not domains in this map.

`Address.tsx` owns clipboard feedback and the existing Sensitive policy, passing display values and callbacks to AddressField. Freshness receives the caller's formatted age and observation timestamp; it has no timer or fetch loop. EntityRow keeps independent actions outside the navigation target. EntityCard uses Radix Slot when an existing motion/reorder article or form must remain the root element. Editable titles and title-area controls can supply their own root through `titleAsChild`; other titles use the explicit heading level. Dialog still owns its focus, title association and overlay header.

Use `dev:ui ?scenario=shells-light`, `shells-dark`, or `shells-narrow` to mount the actual shells with fixed timestamps and local action receipts. Set a narrow viewport for `shells-narrow`. Tab navigation reaches row selection and its independent action separately. The copy-error switch, missing address, unknown brand/state, disabled row, privacy toggle and retained stale timestamp expose the shell boundaries. Quota rings and full quota visuals remain in `agent-panel`, `agent-panel-used`, and `topology-accounts`.

SectionHeader keeps trailing actions at their intrinsic width and aligned to the end. PlatformIcon renders monochrome provider assets as current-color masks in both themes. The shared row baseline uses the account list's 12px padding and gap. Cards use the account card's 16px padding, 12px gap and radius; host-specific catalog, setup and relay dimensions use semantic Tailwind utilities and geometry-owned dimensions. Source rows expose their connection as an independent TUNNEL Chip, wrapping below the navigation target when needed. Connection rows retain their second address line. Task state uses the shared Status dot and mapped tones instead of an independent animated pill. Source headers use brand artwork without alias initials. Provider quota masks and Agent artwork preserve their separate existing assets under one resolver.

`ViewStack` retains inactive panel state with semantic hidden visibility; its `asChild` slot preserves motion roots. `MeterSegment` owns proportional flex weights while quota callers retain their visuals and interaction data. Button's `surface` variant supplies shared native behavior for geometry-owned topology and dock targets without imposing rectangular control styling. All three are exported through design mounts and exercised in the forms fixtures.

`forms-light`, `forms-dark`, and `forms-narrow` mount settings/form shells and DispatchSpec states. They include navigation-only hover, disabled navigation, zero/one/unlisted choices, wrapping buttons, help/error associations, validation focus, controlled inputs, disclosure keyboard behavior, danger consequences, and historical/missing/unresolved dispatch records. Design islands export the same components with plain-text slots; real control composition remains in browser fixtures.

### One domain state map

The map is keyed by **domain + projected state**, not an unqualified word such as `pending`. Existing projectors still determine truth; the map determines only tone, label key and icon. Label families below refer to existing families where available; missing keys are future localization work. Node wires may consume the same semantic state while retaining their own geometry. Unknown values MUST produce a neutral unknown label, not success.

| Domain / source | Projected states → tone and icon | Label key rule |
| --- | --- | --- |
| SRC / ControlSource | connected → success/Check; disconnected → neutral/Unplug; revoked → danger/Ban; pending switch → warning/ArrowRightLeft | `source.state.*`; pending-switch label from existing switch messages |
| Connection / ingressState | connected → success/Check; connectingLabel → neutral/Loader; connectionError → danger/AlertCircle; disabled/disconnected → neutral/Power/Unplug; unknown → neutral/CircleHelp | Existing ingress projector keys; raw Ingress.state is projected first |
| Agent / agentState | connected/agentAvailable → success/Check; preparing → neutral/Loader; connectionError → danger/AlertCircle; disabled/disconnected → neutral/Power/Unplug; unknown → neutral/CircleHelp | Existing Agent projector keys; do not treat installed as healthy |
| Account / health; profile / state | ready or signed-in → success/Check; attention or signed-out/unfinished → warning/AlertCircle; removed or invalid → danger/Ban | Separate account-health keys; `accounts.profile.*` for profile state |
| TASK / taskState | running → accent/Loader; needsYou → warning/MessageCircle; done → success/Check; failed → danger/AlertCircle; interrupted → warning/Pause; unknown → neutral/CircleHelp | `detail.state.*` |
| Dispatch / dispatchState | running → accent/Loader; pending → warning/Clock; completed → success/Check; failed → danger/AlertCircle; unknown → neutral/CircleHelp | Existing dispatch labels; never equate a receipt's acceptance with task completion |
| Permission | granted → success/Check; missing → warning/Circle; unknown → neutral/CircleHelp | Existing PermissionsPage label selection; not-applicable items remain omitted |
| Interaction submission | submitting/pending → neutral/Loader; submitted → success/Check; failed → danger/AlertCircle; unconfirmed → warning/CircleHelp | Submission labels; submitted means response submitted, not execution completed |
| Authorization / OAuthRequest.status | pending → warning/KeyRound; approved → success/Check; denied → danger/Ban; expired → neutral/Clock; unknown/other terminal → neutral/CircleHelp | Existing OAuth/connection labels, with distinct expired/unknown labels where absent |
| Relay member / online | online → success/Check; offline → neutral/Circle | Existing connection online/offline labels; isSelf is identity, not health |
| Deployment / RelayProgress | idle → neutral/Circle; login → warning/KeyRound; deploying/connecting → neutral/Loader; ready → success/Check; failed → danger/AlertCircle; cancelled → neutral/Ban | `connect.phase.*` and existing failure/cancellation labels |

Selected, focus, busy, disabled, privacy and attention are orthogonal presentation states. They MUST NOT rewrite the domain state. A selected failed row stays failed. A refresh error preserves the last known state with an error Notice and freshness evidence. Quota's window colors, pace and exhaustion keep their existing quota-specific mapping rather than being flattened into health badges.

## 2. Object components

### Shared variant rules

Every non-N/A table cell below inherits these rules:

- Chip is an inline reference with name/icon and compact state when state exists. Click opens the canonical inspector only when a valid target exists; otherwise it is text. It has no header actions.
- Node selects/opens the corresponding homepage layer and supports selected/attention/focus and applicable reorder/collapse behavior. TUNNEL lines are the explicit non-clickable exception. Task attention belongs to the TASK Node; requests do not acquire nodes.
- Row uses EntityRow. Click follows the row's declared destination; choice contexts use SingleChoice and do not turn navigation into mutation. Header actions are N/A; trailing actions are named in the table.
- Card uses EntityCard and SectionHeader inside the canonical surface. Its body does not navigate. Header actions are explicitly listed; destructive actions live in the danger zone and retain confirmation consequences.
- Selection and attention are host-supplied for reference Chip/Row and topology Node variants; Card attention is expressed by its state or request, not a second selection model.
- All mounted variants support loading, retained-data refresh, read/action error, disabled actions and missing optional data through their owner. Show Empty at collection level, not one empty Card per missing record. Never invent timestamps, health or identities. Busy controls prevent duplicate submissions.
- Privacy uses the existing user preference and explicit sensitive fields. Masked content MUST NOT leak through titles or accessible names. Alias/title text is not automatically sensitive. Secret question inputs are always protected. Design mounts use synthetic records, controlled clocks and stub callbacks, without native login or live writes.

Each variant's **Render** cell is an allowlist. Other fields of its input types are deliberately not shown in that variant; the **Omit** paragraphs call out fields excluded across the object. IDs may route or key actions without appearing as facts. Related-object fields below always name their owner. Counts are derived from supplied collections, never assumed properties of a record. Context flags and callbacks are presentation inputs, not new wire fields.

### SRC platform

**Type:** `(typeof controlSources)[number]` from `ui/controlSources.ts`, plus associated ControlSource/ProviderAccount collections and optional historical `DispatchSummary["controlSource"]` provenance. Product `id` is distinct from vendor `platform`. A selection constraint is caller-supplied, not platform health.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | Task provenance fragments → platform reference | Registry `displayName` (compact `shortName`), `icon`; known source `kind` resolves registry `id`. Live state only from supplied sources. | Unknown product fallback, selected/disabled, partial historical provenance; opens SRC L1 if resolvable. Replaces platform portion of SourceBadge, not the historical source label. |
| Node | ConnectionOverview sourceViews/accountViews platform parent | `displayName`, `icon`; derived account count and projected connection state | Empty/add, connecting/error/inactive, selected/attention, added, collapsed/reorder. Opens L1, or single account L2 with back to L1. Replaces platform GraphNode composition. |
| Row | No read-only Row today; three product selectors → catalog/account-platform entry | `displayName` or `shortName`, `icon`; one caller-supplied constraint line when selecting | Selected/unselected, disabled with reason, unknown/custom; browse opens L1, choice invokes selection. Replaces product rendering in AddControlSource, IngressDialog and SourceProductChoice; option eligibility remains flow-specific. |
| Card | No standalone Card today; SourcePanel brand header fragment → L1 | `displayName`, `icon`; account count and SRC account Rows; setup/docs links from `setup.url`, `docs[0]` when present | Empty/loading/error, partial accounts. Header: Add account preselects product, back/close as host requires. Replaces platform framing only; source facts stay L2. |

**Omit:** raw `id`/`platform`, capability/auth/transport selection metadata, `status`, `clientAuth`, headers, caveat/badge, wait-time hints, full docs list. Metadata can constrain setup without becoming Card facts. Notification capability/binding presentation is deferred.

### SRC account

**Type:** ControlSource plus optional linked ProviderAccount; related Ingress for the connection reference. Historical references use `DispatchSummary["controlSource"]` (`label`, `kind`, routing IDs only), without inventing live state. Multiple sources may belong to an account. A source awaiting identity still has a source presentation; missing identity MUST NOT be synthesized from its label.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | Source provenance/tags → account reference | Account `alias` when resolved, otherwise source `label`; source `product` icon and `state`/`pendingSwitch` projection | Unidentified/unavailable, pending switch/revoked, selected/disabled; opens L2 if current, historical provenance remains text when unresolved. Replaces source/account links and source portion of task provenance. |
| Node | accountViews/sourceViews → SRC L2 topology | Account `alias` or source `label`, `product` icon; flat-mode platform label; source connection state | Repeated unidentified aliases, shared identity, selected/attention, added, collapsed/tree/flat. Opens L2; reorder where supported. Replaces account GraphNode composition. |
| Row | Remote lists, account-role entries → L1 account/source rows | Account `alias` or source `label`, `product`, `state`/pending switch; secondary line: masked account `email` and the connection rendered as a TUNNEL Chip, never as free text | Disconnected/revoked/missing ingress, selected/attention. Row click opens L2. The TUNNEL Chip is a separate target that opens that connection's detail; it sits outside the row's navigation element, so no nested interactive markup. Replaces source-list-row, connection-source-row and AccountDetail source entries. OAuthGrants rows are not an SRC account Row (see Card). |
| Card | SourcePanel/AccountDetail/SourceConnection → canonical L2 | Account `alias`, sensitive `email`/`orgName`, `plan`; source `label`, `state`, `connectedAt`, `lastSeenAt`; connection as a TUNNEL Chip; the latest authorization state only, as an Authorization request Chip (no grant history list; authorization details belong to that object); dispatch Rows; linked Agent profiles by `agent` | Identity loading/unidentified/conflict/unavailable, pending switch, revoked, removed connection, busy/error/privacy. Header: alias edit, Change connection, back/close. Body: connection Chip, cross-role link (kept by user decision); danger: disconnect/merge/remove. Replaces identity/fact portions of the three existing views. No connection edit form or start/stop switch in L2. |

**Omit:** account `identityKey`, `createdAt`, `observedAt`, `displayName`, raw identity evidence/ancestry/IDs, notification fields and quota; quota belongs to AGENT L2. Source `createdAt`, credential IDs/type, retired ingress IDs, switch IDs and pending-switch request/expiry raw values are not facts. Identity resolution gates an explicit unresolved/conflict notice without printing evidence. Removal/merge associations still route correctly. Account maintenance actions require an actual ProviderAccount.

### AGENT platform

**Type:** Agent (`ui/state/agents.ts`), plus optional ProviderSnapshot quota and activity collections. Version comes from `version`, display name from `name(agent)`, official links from `agentLinks`; runtime readiness may require the existing CoreSnapshot context. These are not Agent fields.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | Ad hoc Agent references → inline platform reference | `agent` resolved name/logo, projected state | Installed/available/disabled/preparing/failed/unknown; opens AGENT L1. Replaces role links and repeated Agent labels where a reference is needed. |
| Node | agentViews/accountViews → AGENT topology parent | Resolved `agent`/`displayName`, projected state, derived active/attention count; optional Quota ring | Selected/reorder/collapse, disabled/absent excluded as today, preparing/error; opens L1 or sole account L2. Replaces Agent GraphNode composition; parent quota is explicitly absent when account rings own it. |
| Row | Uninstalled catalog links and permission fragments → catalog entry | Resolved name/logo, compact `version`, installation/readiness state; one error line from `adapter.error` or `discoveryError` when needed | Installed/not installed, enabling/saving, preparing/failed, selected/disabled. Browse opens L1/details; trailing enable switch or official setup link. Replaces uninstalled tiles and repeated catalog summary markup, not permission diagnostics. |
| Card | AgentCard, AgentDetails, AgentView → catalog Card or canonical L1 | Name/logo, `version`, `installed`, `enabled`, projected state; `adapter.error`/`discoveryError`; account Rows and aggregate TASK Rows. Existing quota composite where applicable; policy summary only when supplied by its authoritative owner. | Empty accounts/tasks, loading/error, unavailable adapter. Header: open app when supported, display settings, back/close/width. Catalog header includes enable switch; official setup link in body. Replaces repeated platform headers/details; catalog still owns enable/order. |

**Omit:** raw executable `descriptor.command`/`args`, `protocol`, raw `status` (use projected state), compatibility source arrays/caveats except actionable diagnostics. No model/default-effort/criteria fields exist on Agent; do not fabricate a dispatch-policy summary from Agent or a task's DispatchSummary. Its future data source remains an open question.

### AGENT account

**Type:** ProviderAccount plus its AccountAgentProfile(s) for the selected Agent; related Agent supplies branding. Account-wide identity and per-profile authentication/default state remain distinct. Rows may select a specific profile; the canonical L2 is account + Agent.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | SourcePanel profile links → cross-role reference | Account `alias`, profile `agent` resolved name/logo, profile `state` | Signed-in/out/unfinished/invalid, missing account, selected/disabled; opens AGENT L2. Replaces profile links with a consistent reference. |
| Node | accountViews → account topology | Account `alias`, selected Agent logo, `quota` ring, profile state/attention; flat-mode Agent name | Shared identity, repeated aliases, selected/attention, unknown quota/loading/error; opens L2, preserves supported account reorder. Replaces account GraphNode composition. |
| Row | AccountsPage/AccountDetail profile rows → L1 account list | `alias`, profile `state` and `default`; secondary masked account `email` or profile `kind` | Selected/attention, signed-out/unfinished/invalid, busy/default-disabled; opens L2. Trailing default action only for an eligible profile. Replaces shared account list's Agent projection and account-profile rows. |
| Card | AccountDetail + account AgentView → canonical L2 | `alias`, masked `email`/`orgName`, `plan`; profiles' resolved `agent`, `kind`, `state`, `default`; Quota from account `quota`; account-filtered TASK Rows; linked SRC references | Missing/merged/removed, auth error, no quota/tasks, loading/refresh/error/privacy. Header: edit alias, reauthenticate, back/close/width. Body: default switch and SRC link; danger: merge/remove. Replaces account identity/profile/AgentView framing. |

**Omit:** raw account/profile IDs, `identityKey`, timestamps unrelated to quota, identity evidence, notifications, merge ancestry, raw quota provider ID and `displayName`. Quota fields are delegated below. `sources`, `mergedAccountIds` and profile IDs remain association inputs. A Card with several profiles lists their states rather than inventing one account-wide login state; mutations identify the exact profile through `profileId`; ambiguous same-Agent selections are rejected.

### TUNNEL

**Type:** Ingress with Config; optional Relay (`ui/state/relay.ts`) and carried ControlSource collection. Name/kind/provider are derived using existing ingress helpers. A topology line remains projected NodeView/PaintNode/PaintTask geometry, not a claim that every edge maps one-to-one to Ingress.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | SourceConnection connection links/tags → connection reference | Ingress `name`, derived `transport` kind, projected `state` | Missing/removed/disconnected, selected/disabled; opens Connections detail; missing target is text. Replaces connection reference fragments. |
| Node | TopologyPainter/PortraitPainter → topology line | Projected wire state, selected/attention path and geometry; no address, label fact or new vertex | Normal/connecting/error/inactive, task attention/completion, collapse, selected emphasis. **No click or header actions.** Reuses both painters; converges semantic state treatment without replacing layout. |
| Row | Remote connection list + add/switch options + permission rows → connection list | `name`, derived kind, `state`, carried source count; one secondary line: masked `url` or provider label | Selected/ready/offline/unused/error, disabled compatibility choice, busy/privacy. Opens detail; choice invokes selection. Replaces connection-list-row and summary content of add/switch/permission entries. |
| Card | Remote detail, SourceConnection, AddConnection success, IngressDetailsDialog, HostedRelay summary → canonical connection detail | `name`, `transport`, projected `state`, `error`, masked `url`; Config.`httpsProvider`/`connectionMode` when relevant; Relay.`owner`/`workerVersion`; carried SRC Rows and source count | Local/HTTPS/secure tunnel/relay, owner/joined, starting/stopping/error/missing URL, busy/privacy. Header: start/stop, edit, back/close. Body: address copy, add source, relay settings; danger: remove/leave. Replaces duplicated connection facts; success flow mounts a summary of the same Card, with follow-up actions in its host footer. |

**Omit:** raw IDs, `discoveredUrls`, verification timestamps, tool policy, credential flags/secrets and provider-specific config internals. `enabled`/`running` determine controls, not duplicate text badges. Config editing stays in the sole connection editor. Hosted relay membership/deployment is composed from separate objects below. Transport-unavailable does not mean every carried source was revoked.

### TASK

**Types:** TrackedActivity extends AgentActivitySession (`ui/state/activityModel.ts`, `ui/types.ts`); AgentConversation for history; TaskRecord/TaskRuntime (`ui/state/tasks.ts`) for dispatch receipts; AgentTimeline for detail. Adapters select one source kind explicitly. Do not cast one record into another to supply absent fields. Agent identity is enclosing context except where TaskRecord supplies `agent`.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | TaskChip → compact task reference (standalone/design mounts) | Activity `title` or `headline`, conversation `title`, or record `task.title`/`runtime.title`/`task.prompt` fallback; corresponding projected state | Running/attention/completed/failed/interrupted/unknown, missing title, disabled unavailable target; opens task detail. Replaces compact title/reference fragments only. |
| Node | TaskNode via the ActivityBubble live adapter → homepage task bubble | TrackedActivity `title`, `headline`/`fallbackHeadline`, `phase`, `interaction.summary`, `projectName`/`project`, `recentSteps`/`recentContent`, `turnCount`, `startedAt`/`turnStartedAt`, `endedAt`; `dispatchSummary` via DispatchSpec and SRC reference | Compact/standard/detailed, selected/attention, running/completed/unread (`readAt`), overflow, error/disabled. Opens task detail, marks read through owner. Reuses ActivityBubbleContent/PhaseTile/StepTrail rather than redesigning them. |
| Row | TaskRow in AgentConversations, TasksPage, SourceDispatches and resolved update WorkItem → task lists | Live: Node title/state/project/DispatchSpec, one headline line. History: AgentConversation `title`, `status`, `projectName`/`project`, `createdAt`, `turnCount`, `dispatchSummary`. Receipt: TaskRecord `task.title`/`task.prompt`, `task.project`/`directory`, `createdAt`, `agent`, projected `state`/`runtime.runtimeStatus`; DispatchSpec only from recorded fields. | Selected/attention/running/unread/paused/archived/stale/unknown, loading/pagination/error, open disabled when unsupported. Click opens detail; optional trailing Open if supplied. Replaces row framing of the three task lists. Update WorkItem reuses it only when a task resolves; non-task work remains an update composition. |
| Card | TaskCard in ActivityTimeline and TasksPage → task summary in existing detail surfaces | Chosen title/project and state above; DispatchSpec; timeline `ownership`, `turnTimings`, `turnStatuses`, partial `coverage`; receipt `approval.decision`/`source`, `error.message`, `task.prompt`; detail body retains timeline `entries` renderer | Running/needsYou/done/failed/interrupted/unknown, readOnly, partial/truncated, loading/open/review error, narrow/wide. Header: back, open native, width, available retry/resume menu. Body: interaction requests and timeline; dispatch admission approve/reject stays bound to its TaskRecord. Replaces duplicate detail headers and receipt framing, not timeline algorithms. |

**Omit:** raw session/request/thread/turn IDs, cursor/order positions, `phaseSince`, `origin` IDs, account IDs, native IDs, TaskRecord.`task.input`/`settings`/`detailsRecorded`, raw `executionOwner`, `updatedAt`, `approval.at`, runtime `observedAt`, timeline `executionEvidence`/`coverage.reason`. Action routing, freshness and ownership still use their appropriate fields. Historical conversation data does not imply live phase or interaction.

**Retained detail body allowlist:** AgentTimelineEntry `type`, `status`, `text`, `title`, `command`, `cwd`, `path`, `operation`, `exitCode`, `startedAt`, `endedAt`, `durationMs`; `input`/`output`.`text`/`truncated`; `plan[].content.text`/`content.truncated`/`status`; `changes[].path`/`operation`/`added`/`removed`/`diff.text`/`diff.truncated`; `interaction`/`response` through the request adapter; `controlSource` through SRC references; `truncated`. Omit entry IDs, `cursor`, `position`, `updatedAt`, `exitCodeSource`, excerpt hashes/state, `plan.priority`, raw `commandActions`. TaskOwnership renders `owner`/`currentOwner` and `history[].from`/`to`/`observedAt`, not raw event IDs or its top-level `state`/`observedAt`. Existing queued-input and outcome renderers remain separate compositions, not peer messages.

### Interaction request

**Types:** AgentInteraction plus enclosing session/Agent context; ApprovalSubmission for local response progress; AgentTimelineEntry for historical resolution; RequestRouting for routing. AgentInteraction has no top-level `id`, `state`, sender or timestamp. Identity comes from the existing interaction key and response routing, never a fabricated field. TaskRecord admission approval is a distinct adapter, not a native AgentInteraction.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | TASK attention summaries → request reference | `kind`, `title` or `summary`; submission `status` when present | Pending/unsupported/respond-disabled/submitting/failed/unconfirmed/resolved; opens/focuses request in task detail, never answers it. Replaces inline needs-attention summary fragments. |
| Node | N/A | No fields | Attention stays on TASK Node. No standalone interaction node or actions. |
| Row | InteractionAnchor and receipt history → request history/compact anchor | `kind`, `summary`/`title`; question option labels; entry `response.result.answer`/`answers`/`decision`, `response.skipped`, `response.origin.sourceLabel`/`controlSource`. Admission adapter uses TaskRecord `task.title`, `approval.decision`/`source`. | Pending/resolved elsewhere/answered/skipped/approved/rejected, selected/error; opens/focuses associated request or turn. No inline response by row click. Replaces InteractionAnchor/receipt framing without merging their record types. |
| Card | TaskNeedsYou/TaskQuestion + update inline controls → RequestCard composition | `summary`, `title`, `command`, `path`, `cwd`, `preview`, `reason`; `questions[].question`, `options[].label`/`description`, `isOther`, `isSecret`, `multiSelect`; supported normalized legacy `options`; submission `status`/`error`; routing `state`/`deferUntil` countdown | Multiple requests/pager, secret/custom/multiple answers, invalid input, unsupported/locked/readOnly, submitting/pending/submitted/failed/unconfirmed, narrow sheet/privacy for paths. Header: request pager/close as hosted. Body/footer: allow-once/reject or answer/skip, routing pause/resume/handoff. QuestionField and the execution adapter replace TaskQuestion and ActivityInteraction; shared RequestCard replaces duplicated request framing, including update context when a live request resolves. |

**Omit:** raw `respond.via`/`op`/`args`/`hint`, `method`, question IDs, submission payload and routing `pausedBy`/`reason`. They still control supported responses and keys. `canRespond` disables action rather than printing a boolean. Do not imply a persistent permission from allow-once; preserve unsupported bypass behavior. Errors use existing task error presentation. Secret answers remain masked in history. Admission approval keeps its existing approve/reject semantics and does not acquire OAuth pairing controls.

### Peer message

There is no UI peer-message type, store or renderer. AgentTimelineEntry has no peer/coordination discriminator. Generic text, queued input and the source fixture named `peer` cannot establish message identity or delivery evidence.

| Variant | Purpose / today → target | Type and fields | States / interactions / replacements |
| --- | --- | --- | --- |
| Chip | N/A until a real reference surface is selected | None; no fields can be specified from a current UI type | No actions or replacements. |
| Node | N/A; no peer topology placement decided | None | No actions or replacements. |
| Row | N/A pending an approved peer inbox/history use and UI contract | None; sender, recipient, body, time and delivery/read fields are **not** claimed to exist | Future selection/loading/error/privacy requirements depend on that contract. Replaces nothing today. |
| Card | N/A pending a peer inspect/reply use and UI contract | None; no synthetic DTO in this specification | Reply/acknowledge are not authorized behaviors by analogy with task input. Replaces nothing today. |

The object name and four slots are reserved; implementation and design-tool mounts are blocked on the open question below. This explicitly records a type gap rather than disguising an ordinary UserMessage as a peer message.

### Authorization request

**Type:** OAuthRequest plus enclosing Ingress, optional candidate ControlSource[] and a resolved switch source. This new component object consolidates existing OAuth pairing, reauthorization and source-claim flows; it does not add a new wire type. `sourceCandidates` belong to the request, while old connection names and carried sources require related records.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | Pending-switch/authorization tags → pending request reference | `clientName`, `product` branding when present, `status`; claimed source `label` if resolved | Pending/approved/denied/expired/missing, selected/disabled; opens the existing authorization flow. Replaces pending authorization tag composition. |
| Node | N/A | No fields | Request attaches to SRC/TUNNEL; no topology vertex. |
| Row | Pending request notices/claim selectors → connection pending requests | `clientName`, `product`, `status`; source `label` from `sourceCandidates` or resolved `switchSourceId`; optional `expiresAt` relative expiry | Reauthorization/new/switch, stale/missing candidate, selected/attention, busy/error. Opens RequestCard, never approves by selection. Replaces pending-notice/claim summary markup, not source-account Rows. |
| Card | OAuthApproval.ApprovalCard in setup/switch → RequestCard composition | `clientName`, `product`, `status`, `pairingCode`, optional `expiresAt`; candidate source `label`; claimed source `label`/`connectionName`/`connectionRemoved`; related Ingress `name` and current permission scope from `toolPolicy` while that field exists | New/reauthorize/source claim, pending/approved/denied/expired, unavailable candidates, busy/field/action error, privacy on sensitive connection facts. Header: close/back from flow. Body: code comparison, source SingleChoice, new label input, consequences; footer: Allow/Deny. Replaces pairing-card framing while retaining ApprovalCard flow semantics. |

**Omit:** raw `id`, source/switch IDs, `redirectUri`, `resource` and credential data. Pairing code remains readable for explicit comparison; masking a URL is not a reason to hide the comparison code. New source label is form state, not an OAuthRequest field. Expiry is absent when `expiresAt` is missing. Only upstream/action evidence establishes authorization outcome; local expiry can disable stale actions without claiming a denied result. SourceIdentityResolution conflict/evidence is not a second OAuth request schema.

### Relay member

**Type:** exported `Member` in `ui/components/objects/relay-member/model.ts`: `id`, `name`, `isSelf`, `joinedAt`, `lastOnline`, `online`. HostedRelay and independent design mounts share this type. Related Relay supplies ownership/action scope; device-name fallback comes from Status, not Member.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | N/A; no inline member reference use today | No fields | No actions or replacements. |
| Node | N/A; relay devices do not become homepage nodes | No fields | No actions or replacements. |
| Row | HostedRelay member table → member list | `name` (self fallback from Status.`deviceName`), `isSelf`, `online`; one secondary line with `joinedAt`/`lastOnline` age | Self/other/online/offline/never seen, loading/error/busy/disabled; privacy-mask device name in sensitive contexts. Row has no navigation until a member inspector exists; trailing Remove opens confirmation for non-self only. Replaces DataTable cell compositions. |
| Card | Member-removal confirmation summary → contextual review Card | `name`, `isSelf`, `online`, `joinedAt`, `lastOnline` | Self-protected, stale/missing member, busy/action error/privacy. Header: dialog close; danger/footer: confirm Remove with consequences. Replaces the member summary in HostedRelay's confirmation dialog; does not create a second member management page. |

**Omit:** raw member `id`; parent relay IDs and URLs. Parent ownership and busy job state gate actions. Online is observation, not proof of reachability after the last read. Freshness must not invent a member observation timestamp; only joinedAt/lastOnline exist.

### Deployment progress

**Type:** RelayProgress from `ui/state/relay.ts`, with optional parent Job action (`create`/`redeploy`/`delete`) from RelayHosting. This is a relay deployment object, not AppUpdate's separate lifecycle schema. No percentage or start/finish timestamps exist.

| Variant | Purpose / today → target | Render | States; click / header actions; replaces |
| --- | --- | --- | --- |
| Chip | Repeated busy/job summaries → compact connection/hosting progress | `action` when present and `phase`; `cancelled` overrides failure wording | Idle/login/deploying/connecting/ready/failed/cancelled, attention for login/account choice; opens active job Card only when its owner provides a target. Replaces busy job summary fragments; no new persistent job list. |
| Node | N/A | No fields | Deployment belongs to connection/hosting, not topology. |
| Row | N/A; no deployment history/list currently exists | No fields | No actions or replacements. |
| Card | RelayProgress in AddConnection, RelaySettings and RelayHosting → shared progress Card | `phase`, `action`, classified `reason`/`failedPhase`, `cancelled`, masked `loginUrl`, `accounts[].name` with masked `id` fallback; terminal masked `result.url` and `result.deleted` when present | Login required, progressing, ready, failed/timeout/invalid invite/account unavailable, choose-account, cancellation, busy/read/action error/privacy. Header: close when safe, owner-supplied cancel action; body: steps, login URL copy, account SingleChoice; footer: Retry/Cancel as available. Replaces remote-progress framing while preserving one progress owner and its request identity checks. |

**Omit:** raw `jobId`, `relayId`, `ingressId`, result IDs and account IDs except existing display fallback. `reason` is classified for readable failure text, not dumped with tokens. No elapsed time/progress percentage is inferred. Close does not silently cancel; cancel invokes the owner's actual cancellation callback.

## 3. Composites

### Quota

Reuse existing AgentQuota, AgentQuotaIcon and QuotaBubble behavior and visual design. Ring, bar, bubble and full panel are composite forms, not extra object variants. AccountQuota remains an adapter over the same renderer. Logo lookup alone converges into PlatformIcon.

| Form | Data actually rendered | Behavior / existing implementation |
| --- | --- | --- |
| Ring | ProviderSnapshot selected `windows`: `label`, `usedPercent`, `resetsAt`, `exhausted`; selection by `displayWindowId`, window `id`/`poolId`; `state` and blocking flags affect presentation | Preserve single/dual rings, used/remaining, timing ticks, accessible labels and expired-window omission from AgentQuotaIcon. Null account quota means logo-only, not fallback to another account's quota. |
| Bar | QuotaWindow `label`, `usedPercent`, `resetsAt`, `exhausted`, optional `scope`; provider timing context | Preserve AgentQuota track, pace warning/tick and reset preferences. No redesign or independent window-fetch loop. |
| Bubble | Provider `name`, `agentId` branding, `plan`, all windows, `observedAt`, `state`, `refreshing`, readable `error.code`/`message`; `creditBalance`, `availableResetCount`, `resetCredits[].count`/`expiresAt`; `productUsage.basis`/`shared`/`rows[].label`/`percent`; supported `rawUsage.sharedUsageError` | Preserve QuotaBubble disclosures, links, blocked/exhausted/stale/error/empty behavior, hover/focus, refresh and privacy on error text. Link comes from existing provider presentation, not an invented ProviderSnapshot URL field. |
| Full panel | Same contract, composed into account/platform detail or UsageOverview; account `quota` uses only its actual subset | Preserve AgentQuota's compact two-window selection and QuotaBubble's full-window detail as intentional presentations of one data contract. Freshness owns age/refresh framing; reset credits and usage disclosures retain their current interaction. |

`eligible`, `agentIds`, `accountBlocked`, `blockedPoolIds` and settings gate/associate presentation; do not print their raw values. Omit credential flags/source, provider/pool IDs, `lastAttemptAt`, error `retryAt` and arbitrary rawUsage. Existing quotaTiming may consume Cursor billing-cycle dates; that is calculation input, not a generic raw-data panel. Account quota has no plan/credit/productUsage fields: use explicit related account plan where needed and never invent missing quota details. Missing, stale, refreshing, unavailable, blocked, exhausted, unknown reset and expired credit require mounts. Account `quota.error` is unknown-typed; narrow it before rendering and do not assume ProviderSnapshot error fields exist. Selected/disabled are host/action states; privacy does not mask numeric percentages by default.

### RequestCard

`ui/components/composites/RequestCard.tsx` composes EntityCard, SectionHeader, review context/body, state/error and response footer. It owns the pager placement, form boundary, busy footer disabling and optional request focus target. Dialog continues to own layered Escape and trigger focus restoration. TaskNeedsYou keeps per-request drafts, routing and sheet state; navigation never submits a response. Narrow and wide mounts receive the same request data.

`objects/interaction-request/Card.tsx` receives AgentInteraction, ApprovalSubmission, answer drafts and an execution-response callback. Its live adapter retains interactionKey and submitActivityResponse. TaskNeedsYou and AppUpdate use that adapter, including the full permission preview in update contexts. QuestionField retains single/multiple/custom choices, numeric keyboard selection and password inputs. Row receives timeline evidence and masks secret response history; its live adapter looks up local receipts. AdmissionRequestRow remains a separate TaskRecord adapter.

`objects/authorization-request/Card.tsx` receives OAuthRequest, Ingress, candidate/claimed sources and controlled form/action props. ApprovalCard in its adapter retains source claim, naming, capability-profile selection, decision API and refresh behavior. OAuthApproval re-exports that adapter for setup, switch and RemoteLinkPage callers; there is one renderer, not a compatibility implementation. Inline setup/switch buttons continue to submit the identified form from their owning dialog footer. Execution allow/deny/answer and OAuth Allow/Deny never share a generic approval action.

`SourceAuthorizationChip` projects only the active switch request or source-bound OAuth credential. It never enumerates grant history. SrcAccountCard mounts this adapter and related pending AuthorizationRequestRows in SourcePanel and SourceConnection. Hosts open the existing authorization flow with the selected request and connection IDs. Authorization Row opens review and never authorizes by selection.

DeploymentProgressCard replaces RelayProgress in AddConnection, RelaySettings and RelayHosting. The state hook and each host retain job identity checks, polling, cancellation and retries. The Card composes DeploymentProgressChip, phase steps, classified failure, explicit account choice, protected login address and terminal URL. RelayMemberRow and RelayMemberCard replace HostedRelay's member table cells and removal summary. The host retains confirmation, self protection, current-member validation and owner/busy gating.

`requests-light`, `requests-dark` and `requests-narrow` mount these real objects with synthetic records and local callbacks. They include secret and multiple answers, paging with retained drafts, unconfirmed/failed/submitting states, privacy, authorization errors, account selection, member self protection and sheet keyboard/focus behavior. `ui/design-mount` exports the composite and every applicable Chip/Row/Card with `Arc.fixtures.requests`. Peer messages and notification binding remain deferred.

### DispatchSpec Chip

The Chip owns acquisition of the **recorded** spec for the current task or turn through its adapter, followed by Agent-specific label resolution. Callers provide task/turn identity and Agent context, not a preformatted string or the current global dispatch defaults. A design mount supplies that same adapter with a fixture record and resolver.

| Input | Render / precedence | Deliberately excluded |
| --- | --- | --- |
| AgentTimeline + selected turn ID | `turnDispatchSummaries[turnId]` when present; task-level `dispatchSummary` only for current/task summary, never to relabel an older turn | Other turns' defaults and runtime settings |
| AgentActivitySession / AgentConversation | Its `dispatchSummary.model`, `effort`, `serviceTier` | `controlSource` and `agentAccountId` belong to other references |
| TaskRecord | Recorded `task.model`, `task.effort`, and `task.dispatch.serviceTier` when present; Agent context from `agent` or enclosing owner | Do not read arbitrary `task.settings` as a known tier contract |

Resolve model identity using the dispatch Agent's model catalog/formatter. Omit a recognized leading brand/provider word (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, GPT, Claude, Gemini, Grok or Qwen) followed by spaces or hyphens, then replace word-separating hyphens in the remaining readable name with spaces. Leave the name unchanged when no prefix matches or removal would leave it empty. This generic rule applies only to native readable names, never model IDs or a UI model-name mapping: `GPT-6-Astra` becomes `6 Astra`, and `Claude Opus 5.5` becomes `Opus 5.5`. Render the resulting model/provider label, then readable effort and service tier (`priority` → Fast). Preserve missing values instead of substituting today's defaults. Unknown agent/model or failed resolution must stay visibly unresolved and retain accessible original evidence; a formatter MUST NOT invent a friendly label from an opaque identifier. The label adapter reads the local `agents/dispatch-catalog` management route, reusing native dispatch catalog acquisition without reading defaults into recorded specs.

`ui/components/composites/DispatchSpec.tsx` implements acquisition from typed records and shared label resolution. ActivityTimeline, ActivityBubbleContent (including conversation rows) and TasksPage use it. The known dsh example `["magpie","opencode-go/deepseek-v4.1-flash"]` resolves from its ACP option name to `V4.1 Flash · OpenCode Go · Max` for recorded `max` effort. There is no model-ID prettifier or guessed model-name table. Full identities are compared, including JSON-encoded ACP IDs. Pending resolution uses a neutral loading label and retains recorded effort and tier without exposing the raw model ID. Refreshes retain previously resolved names. Only completed resolution without a name or catalog failure renders the raw ID with a visible unresolved marker and accessible original evidence.

| Agent family | Model label source |
| --- | --- |
| Codex | Native `model/list` `displayName`, with pagination; reused dispatch-policy model reader. |
| dsh, Claude, Cursor, OpenCode, Gemini, Copilot, Kimi, Qwen, Kiro, Devin, Cline, Junie, Hermes, Droid, Goose, CodeBuddy, omp, and custom ACP drivers | Existing dispatch catalog from live/persisted session `configOptions`: model option `name` and optional group. Older ACP `models.availableModels[].name` is the native fallback. No session is created or resumed to discover labels. |
| Pi | Existing live Pi RPC `get_available_models` names or installed native registry/persisted catalog snapshot. |
| Grok | Existing ACP catalog or native `models_cache.json` names/persisted catalog snapshot. |
| Unknown/unavailable Agent or missing name | Visible unresolved raw ID; no synthetic label. |

Effort labels prefer matching model-specific or same-model session option names, then localized effort vocabulary. `priority` is Fast; `default` is Standard. Other unknown effort/tier IDs remain marked unresolved. Catalog reads are deduplicated and cached for one minute per Agent/task; later mounts retry. Current settings, account health and quota never supply recorded values. Design mounts use the same record adapter with fixture catalogs. Claude transcript specs read `message.model` and recorded `perTurnEffort`/`effort` from assistant execution records; a new user turn clears the previous spec. Missing values remain absent. The inline variant uses the same outlined pill treatment as adjacent task project tags; the shared composite owns its styling. Click has no action. The chip has missing/loading/unresolved/error states, no independent selected state, and full readable text and original evidence when truncated.

## Naming, mounting and convergence

| Location | Responsibility |
| --- | --- |
| `ui/components/ui/` | Object-agnostic shells, exported with existing primitives; no domain imports |
| `ui/components/objects/<object>/` | `Chip.tsx`, `Node.tsx`, `Row.tsx`, `Card.tsx` only where applicable, plus a local index; e.g. src-platform, src-account, agent-platform, agent-account, tunnel, task, interaction-request, authorization-request, relay-member, deployment-progress |
| `ui/components/objects/statePresentation.ts` | Single domain/state → tone/label key/icon map; projection stays with its owning domain |
| `ui/components/composites/` | RequestCard and DispatchSpec composition; quota initially imports existing subscriptions/components implementations rather than copying or wholesale moving them |
| Existing scenario infrastructure | Mount real components with typed synthetic records, controlled time, theme/locale/privacy and observable action callbacks. Export actual object components for design tools; do not create a parallel mock component library. Peer-message exports wait for its contract |

The mount boundary SHOULD be explicit props plus existing types. Containers own stores, fetching, navigation, selection and mutations. Object adapters own identity and projection; shells only arrange content. This makes design mounts and agent inspection predictable while keeping product behavior in its existing domain. It trades a small explicit adapter boundary for reuse without hidden live-store dependencies; it does not introduce a universal object schema.

Recommended order:

1. Shells and state map: inventory current consumers, converge logo lookup, headers, row/card frames, facts/freshness/address and feedback usage. Preserve existing primitives and quota visuals. Add representative light/dark, narrow, keyboard, error and privacy browser mounts as components become real.
2. SRC/TUNNEL: implemented under `objects/src-platform`, `objects/src-account` and `objects/tunnel`, with local indices and design exports. Remote lists, carried-source lists, account source-role rows, source identity/connection tabs, product and connection choices, permission connections, setup success and hosted Relay summaries use these adapters. Platform Card is mountable; no new panel placement is introduced. Mixed account maintenance, the phase tile provenance overlay, advanced credentials/grants, notification binding and account-store synchronization retain their separate owners.
3. TASK: implemented under `objects/task` with Chip, Node, Row and Card exports. AgentConversations, TasksPage and SourceDispatches share TaskRow; resolved update work also uses it. ActivityTimeline and receipt detail share TaskCard. ActivityBubble remains the live navigation/update-blocking adapter. DispatchSpec retains recorded-turn resolution, dsh labels, brand-prefix shortening, Claude Code recorded specs and absent tiers.
4. AGENT platform/account: implemented under `objects/agent-platform` and `objects/agent-account`. Catalog, AccountsPage, AgentView and topology use shared branding, identity, profile Rows and Card framing. SRC and AGENT share account identity projection while retaining distinct role references. AgentQuota, QuotaBubble and AgentQuotaIcon remain the quota renderers.
5. Interaction and authorization requests: implemented with RequestCard and separate execution/OAuth adapters, relay deployment and member objects. SRC account hosts also mount SourceAuthorizationChip and pending authorization Rows, without grant history.
6. Peer message only after its data contract and placement are decided. Notification binding remains deferred.

`debt-*` light/dark fixtures mount Tasks, Records, Permissions, AgentsSettings, AgentDisplaySettings, AddAccount, MergeAccounts, RelayHosting and OAuthGrants. `settings-light/dark` and `updates-settings` cover the main Settings hosts. `settings-extras-light/dark` cover Relay hosting and Experimental through the real settings navigation. `management-table-light/dark` cover shared table rows, pagination and empty states. Future browser coverage must include both empty homepage wings, account-store disagreement recovery, unknown icons/states, dsh recorded spec, quota failure families. Layout/state acceptance uses browser fixtures; this document does not require a native app run or claim any visual acceptance.

### SRC/TUNNEL implementation and mounts

`src-tunnel-light`, `src-tunnel-dark` and `src-tunnel-narrow` mount all twelve variants using existing types and fixed timestamps. The shared account inspector requires explicit per-source selection before mutation. `src-account-multiple` exercises the real SourcePanel with multiple sources and verifies that older grants are not an SRC history surface. Browser acceptance covers row/Chip keyboard separation, missing destinations, disabled actions, retained-data errors, identity conflicts and privacy.

Object adapters own labels, associations and state presentation. Hosts own stores, fetches, navigation, eligibility and mutations. SingleChoice accepts static object Row content while retaining its own selection and accessible name. SRC Card uses SourceAuthorizationChip for the active switch (preferred) or current bound credential. Pending Rows are associated by request, source or switch-source identity; selecting one opens review without authorizing. Absent authorization evidence never becomes an inferred approval. Account maintenance and cross-role links remain in current hosts.

TunnelNode is the SVG boundary used by Topology; a standalone projected frame mounts the same two painters for design tools. It adds no graph vertex, click target, geometry or new transport inference. The painters retain their existing orientation-specific visuals and consume the common semantic wire-state mapping. Existing quota and notification components are unchanged.

### TASK implementation and mounts

`objects/task/projection.ts` adapts existing conversation and receipt types without treating a receipt as a live activity. AgentConversations retains account filtering, merging, unread grouping and pagination; it uses the explicit conversation adapter for historical rows. TaskRow discriminates activity, receipt and source-dispatch contexts, retaining their existing phase/date/prompt differences and action eligibility. A dispatch receipt alone never proves task completion. Compact TaskChip references remain text when no navigation callback is supplied. Update work with a resolved live session uses TaskRow; other work retains its update-specific title/count and request controls.

TaskNode reuses ActivityBubbleContent, Headline, PhaseTile and StepTrail in `objects/task/Content.tsx`. Its owner supplies navigation, mark-read, reorder and update-blocking inputs. Pointer-drag cancellation, ArrowUp/ArrowDown, independent mark-read focus, densities and topology anchors retain their original behavior. No topology solver, painter or notification binding changes are part of this layer.

TaskCard composes EntityCard and SectionHeader, preserving the timeline root/ref and its scroll/request dock. Its discriminated timeline/receipt inputs project summary state, project, recorded specification, provenance, ownership and turn progress. Containers retain fetching, native open, width, back/close, review, retry/resume, receipt admission and timeline rendering. Receipt dialogs retain Dialog focus/Escape ownership and use TaskCard for the visible header. Task content is not newly classified as sensitive; secret question history retains the request adapter's masking in both privacy modes.

`task-objects-light`, `task-objects-dark` and `task-objects-narrow` mount all variants with fixed records and observable callbacks. They cover keyboard reorder and independent row/read actions, unread completion, attention, historical interruption, stale/failed dispatches, unavailable destinations, busy/open controls, retained review error, read-only partial detail and masked secret history. The recorded-spec gallery reuses the shared fixtures, including older dsh turns, absent tier, missing prior turns, Claude recorded specs, label loading/failure and unresolved models. `ui/design-mount` exports the same four components and `Arc.fixtures.tasks`; Card body and Row action slots accept plain text across the React island boundary. Browser execution remains main-only.

### AGENT implementation and mounts

`agent-platform` exports Chip, Node, Row and Card. The platform state projector retains the existing Codex desktop/app-server distinction with explicit Status input. Catalog hosts retain reorder, enablement, official-link navigation and error handling; the Card shares branding/version/adapter framing. AgentView composes the panel Card with existing quota and conversation renderers. Platform L1 links account Rows to account + Agent L2 without moving panels.

`agent-account` exports Chip, Node, Row and Card, with explicit AgentProfileRows for mutations. AccountIdentity and AccountIdentityIcon share account email/org/plan and branding with SRC without conflating authentication with source connectivity. SourcePanel renders one AgentAccountChip per Agent, including all distinct profile states. AgentView links back through SrcAccountChip. AccountsPage keeps account-wide alias, merge/remove and notification ownership. Its mixed-role list uses an explicit account projection rather than selecting a source or mutation profile by array order.

Ordinary Agent Chips pass a 16px PlatformIcon size; platform and profile Rows pass 20px. Button sizing defaults apply only to direct icons; nested PlatformIcon artwork and quota rings own their dimensions. Functional Icon controls retain their explicit 16px or 20px size. Browser acceptance measures node artwork relative to its scaled frame and center separately from control icons. Percentage sizing belongs to the quota/node frame. Platform and profile Rows reuse the shared object-row wrapping so identity, state and independent actions remain readable in narrow account cards.

Each profile mutation carries its own `profileId`. Native `account_update` and `account_reauth` accept this selection and reject ambiguous or foreign profiles. Single-profile calls remain valid. Codex reauthentication uses only its current `codex-home`; it cannot reauthenticate an archived profile. Profile IDs route actions without becoming display facts; numbered profile rows distinguish otherwise identical kind/state records. Task filtering continues to use account and merged-account identity, not a profile guessed from tasks.

`agent-objects-light`, `agent-objects-dark` and `agent-objects-narrow` mount all eight variants, independent profile controls, cross-role Chips, current/pending authorization, missing identity, disabled/signed-out state, retained read errors, privacy and quota state families. Keyboard behavior includes selecting the second profile as default and reauthenticating the third profile. Their acceptance script also checks privacy, control logo bounds, readable profile identity, control overlap and overflow. These fixtures and `Arc.fixtures.agentObjects` use synthetic records; no native login occurs. Design mounts export all eight variants alongside the existing quota composites. Browser acceptance remains main-only.

Quota rendering retains the single/dual ring sizes and mature compact/full detail presentations. Account quota errors are narrowed from unknown input into readable provider errors; null account quota never falls back to another account. Notification binding, TASK content, peer messages and draft object-model placement remain with their existing owners.

## Decisions (user, 2026-10-26)

- Cross-role links between SRC L2 and AGENT L2 stay; consistent object Chips are expected to remove the earlier confusion.
- SRC L2 shows no authorization history. It shows the latest authorization state through the Authorization request Chip; OAuthGrants-style history is not a separate SRC surface.
- An SRC account Row may show its connection, but only as a clickable TUNNEL Chip that opens that connection's detail.
- Peer messages: deferred; designed together with the planned read-only AX visualizations (board, event center). The four slots stay reserved.
- Several sources or same-Agent profiles under one account: accept the proposed default below (one account inspector, explicit per-source/per-profile rows for mutations, never the first record silently).
- Dispatch policy summary and readable model labels: read from existing native data, not UI mappings. The `dispatch_policy` op already returns defaults, models and criteria; ACP agents expose readable model names in their session config options (e.g. dsh: `DeepSeek V4.1 Flash · OpenCode Go`). Expose these to the UI.
- Draft placement: converge components in current hosts first; object-model panel moves are a separate, later change.

## Open questions (original wording; resolved above)

| Decision needed | Concrete boundary / proposed default |
| --- | --- |
| Peer messages | Which real inbox/history/detail surface and authoritative UI type should expose coordination messages? Define field and action contracts before enabling any of the four slots; no simulated sender/delivery/read evidence. |
| Account with several sources or same-Agent profiles | Is SRC L2 canonically keyed by account + product or by ControlSource? Which source gets Change connection/disconnect when an account groups several sources? Which profile gets default/reauth when an account has several profiles for one Agent? Proposed default: one account inspector, explicit source/profile rows for mutations, never silently choose the first record. |
| Agent dispatch policy and model labels | Which authoritative read supplies the L1 default model/effort/criteria summary and each Agent's readable model/provider labels? DispatchSpec now reads native model/option labels through agents/dispatch-catalog. L1 policy criteria/default presentation remains separate; never use current defaults to rewrite recorded task specs. |
| Draft placement | Should convergence ship the object-model draft's canonical panels/dock removals in the same change, or mount the components in current hosts first? Proposed default: component reuse first, then explicitly approved placement changes; the draft's notification-binding moves remain excluded. |
