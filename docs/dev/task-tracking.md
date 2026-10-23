# Agent task tracking

[UI](ui.md) · [Dispatch Agents](dispatch-agents.md) · [Architecture](architecture.md)

The homepage retains control-source/ARC/Agent primary connections. Agent outer arcs and secondary tentacles connect task bubbles. Bubbles open execution timelines. Node activity, summaries, timelines, and execution evidence share native normalization.

## Scope

Track all active Agent sessions: ARC ACP/Pi tasks, Codex app-server threads, and directly opened Codex Desktop/Claude Code sessions from local transcripts. Timelines use normalized vocabulary rather than raw Agent formats. New Agents require native adapters, not frontend protocol handling. ARC tasks have owned event streams. External sessions may offer read-only timelines or summary fallback with verified native navigation. Never modify controlled-Agent source or private indexes. Public docs/tests/fixtures use generic projects, paths, and accounts.

## Native interfaces and normalization

Core owns normalization. ACP/Pi save it with task records. Codex backfills history on the first timeline request and merges observed dispatch threads. Live timestamps are ARC observation times. History-only start/end times are null. Native durationMs takes precedence without inferred times.

agents/activity returns session snapshots plus activeAgents for existing callers. Approval/question/selection waits count as active. agent_context.evidence contains selected-turn command/file entries. executionEvidence is true, false, or partial according to observation. Protocol events without tools yield empty evidence, not unsupported. Desktop subscribes to agents:activity, Web to SSE, with GET for initial load/fallback.

| Type | Meaning |
| --- | --- |
| user | User/control-source input, including thread additions. |
| text | Agent text, with chunks merged natively. |
| thinking | Reasoning content. |
| command | Command, cwd, status, exitCode, output excerpt. |
| file | Path, operation read/write/edit/create, status. |
| tool | Other tool title/status/input/output excerpts. |
| plan | Plan/todo updates. |
| interaction | Approval/question/selection with respond arguments. |
| error | Error. |

Entries have stable id, startedAt, optional endedAt, and status. Tools use toolCallId/item ID. ACP consumes session/update agent_message_chunk, agent_thought_chunk, tool_call, tool_call_update, plan, and session/request_permission. Missing/other kind falls back to rawInput.command/file_path and tool names. toolCallId links calls/results. exitCode prefers rawOutput, then conservative text extraction, otherwise missing. Pi consumes message_end, tool events, extension_ui_request, and agent_settled. Codex consumes typed thread items including reasoning summaries and backfills history. External activity reads transcript tails for phase/headline without eagerly producing complete entries.

Approval requests containing only toolCallId reuse matching tool command/path/title. Existing excerpt limits and common-secret redaction apply to input/output summaries. Truncated event windows report partial coverage. Execution evidence filters command/file entries. Only absence of protocol events yields STRUCTURED_COMMAND_EVIDENCE_UNSUPPORTED.

### Activity snapshots

```json
{
  "observedAt":"...",
  "agents":{"<agent>":{"sessions":[{
    "id":"...","source":"arc-task|codex-thread|transcript",
    "title":"...","project":"...","phase":"thinking|command|file|tool|text|interaction|idle",
    "headline":"One-line summary","startedAt":"...","turnStartedAt":"...","phaseSince":"...",
    "interaction":{"kind":"permission|question","summary":"...","respond":{}},
    "recentSteps":["thinking","command","file"],"timeline":true,"open":{"kind":"...","target":"..."}
  }]}}
}
```

phase/headline prefer pending/running noninteraction entries over the latest ended entry, with update order breaking ties. Late completion never displaces active work. Pending interaction takes precedence. Resolved interactions no longer select phase/headline. phaseSince uses the selected entry's start. Thinking takes its last line, commands their command line, files their path, and text its latest sentence. Text strips Markdown. Commands/paths remain original.

recentSteps contains at most five observed types in stable-entry chronological order. Chunks/completion/results neither duplicate entries nor move old ones to the end. Include thinking/command/file/tool/text/interaction, excluding user/plan/error. Transcripts may omit it or return empty.

dispatchSummary optionally describes the latest turn with controlSource (id, label, kind), model, effort, and serviceTier. ARC dispatch records take precedence. Persisted native Codex turn context supplies configuration for turns without ARC dispatch records. Pi and ACP supply known model metadata. Unknown fields are omitted. Local CLI origins use kind:local-cli. UI model labels shorten recognized GPT astra/sol/luna/terra IDs; Fast means serviceTier:priority.

turnStartedAt is dispatch time for ARC Agents and observed turn-start time for Codex app-server. External Codex uses latest task_started. Claude uses latest readable user input. Missing trustworthy starts remain null rather than using phase/session start. External start tracking is independent of the 128 KiB summary tail: first scan locates the current turn, subsequent reads use byte offsets, truncation resets scanning, and incomplete last lines wait for the next read.

Pending interactions, including waiting-permission, remain active and separately marked. timeline:true permits a request but does not guarantee complete coverage. fallbackHeadline uses latest readable text/thinking/command/file, then title/latest user message. recentContent provides three readable summaries. Neither changes phase/headline semantics. open is present only for verified navigation. Activity pushes throttle around one second through Tauri/SSE with GET fallback.

### Timeline API

| Operation | Interface |
| --- | --- |
| Activity snapshot | GET /api/agents/activity; CLI agents.activity. |
| Respond locally | POST /api/agents/respond with snapshot `{op,args}` plus answer and stable requestId. CLI agents.respond uses `{"body":{"op":"agent_respond","args":{}}}`. |
| Web stream | GET /api/agents/activity/events, SSE event:snapshot. |
| Desktop stream | Tauri agents:activity with GET-equivalent payload. |
| Timeline | GET /api/agents/timeline/{id}?after={cursor}; CLI agents.timeline with `{"id":"...","body":{"after":12}}`. |
| Open in agent | POST /api/tasks/open with `{"agent":"codex","taskId":"<thread-id>"}`; CLI tasks.open. |

Use sessions[].id: ARC taskId for ACP/Pi, with separate nativeSessionId, or Codex threadId. after defaults to 0 and is an entry-update sequence. Chunk merges, completion, and interaction resolution advance it. Replace entries by ID, retain absent entries, and sort by position. Backfill may update positions. Cursor beyond current sequence returns TIMELINE_CURSOR_EXPIRED and requires a full read. Frontends never process raw chunks.

turnDispatchSummaries optionally maps turn IDs to the same dispatch summary. Merge summaries by turn ID during incremental reads. turnStatuses preserves native turn outcomes by ID so a recovered tool failure does not erase a completed turn answer. Text entries preserve a native phase when available, including Codex final_answer; absent phases remain unknown.

```json
{
  "sessionId":"<activity-session-id>","status":"completed",
  "entries":[{"id":"command-example","type":"command","status":"completed",
    "startedAt":"2026-01-01T00:00:00.000Z","endedAt":"2026-01-01T00:00:01.000Z",
    "updatedAt":"2026-01-01T00:00:01.000Z","cursor":13,"position":0,"turnId":"turn-example",
    "command":"printf example","exitCode":0,"exitCodeSource":"rawOutput"}],
  "cursor":13,"coverage":{"state":"complete","truncated":false},"executionEvidence":true
}
```

Tool excerpts use agent_context's 1024-byte structure with truncated/hash. Merged text caps at 256 KiB. Event/entry windows retain 2000 entries/8 MiB. Window loss or text truncation marks partial. Codex backfill is serial once per thread/Core using thread/read includeTurns:true and deduplicating typed items by ID. Live updates during backfill win. Existing observation times remain. History order precedes live-only items. After restart, ARC task records identify backfillable threads and restore timeline entry points. Desktop restores read-only subscriptions without resuming/restarting work. External history is fetched only through the separate read-only detail path.

Read failure, missing turns/items, or limits produce partial. Successfully projected history does not become partial solely because the raw event window expires. Failed backfill retains live entries and is not repeatedly retried in the same Core. status is task status. position need not be contiguous and does not reset after eviction. durationMs is native duration when available. Historical times may be null. Pi interaction.method is select/confirm/input/editor. Responses use value, string value for input/editor, or cancelled:true through agent_respond.

Activity checks around once per second ignore observedAt-only changes. Transcript tails sample around every two seconds without eager timelines. Same-entry content changes retain phaseSince. respond uses existing Agent/Codex contracts with answer/options and a new requestId. open.taskId declares native task navigation. Timeline, records, and setup send only agent and taskId to tasks/open. The adapter builds the deep link and the backend opens it natively; callers cannot supply URLs. Agents without a deep link expose no action. Codex tasks created outside Desktop become visible after Desktop restarts. The webview opener retains its default web, mail, and telephone schemes.

## Homepage UI

### Layout and nodes

solve(scene,params,drag) owns both wings. Sources use 78px rows/56px minimum. Idle Agent rows use 78px/44px minimum when tasks exist. Active rows use max(base,n × 64 + 10), with 12px gaps and five slots maximum including overflow. Scene height is max(viewport,larger column + 140). Both wings align to scene center. Sources never shrink/fade because Agents are busy.

Without tasks, both wings use normal size 1/source row spacing. Active Agents scale 1.1. Idle Agents stay 1 without indent when space permits, otherwise shrink to default 0.6 (adjustable 0.4), indent up to 22px, and use opacity 0.62. Base size is 44px, adjustable 32-60px. Names remain below. Horizontal fitting compresses left then right spacing, to minimum ratio 0.72, then centers with bubble weight 0.8 and 40px margins. Remaining overflow clips the right while preserving the left and vertically scrolling the scene.

Keep node details, quota rings/QuotaBubble, and arrow sorting. Brand icons scale with nodes without loading spinners. Task bubbles/tentacles show activity. Counts appear only in the panel-open behavior below.

### Arcs, tentacles, and bubbles

Outer radius is half current node size times scale plus 11px. Round stroke width is 4 × max(0.8,center radius/130). Secondary ports follow target direction at 0.75 with 9° minimum spacing/58° maximum half-angle. Arc ends extend 9° beyond ports with 14° minimum half-angle. Earcup follow is 0.7, spacing 7°, maximum half-angle 42°, end margin 7°, minimum half-angle 22°.

Bubble centers follow adjacent half-heights plus a 10px taskGap, with inner edges 104px from node center. Each task supplies its width and height to the solver. Width, height, and position use the same springs. Stored pitch overrides migrate once to taskGap, preserving other overrides; explicit imports accept only the current parameter names. Cubic controls follow root normals/bubble horizontal axes with tension 0.34/0.5 of endpoint distance. Roots widen by arc length. The left solver supports mirrored tasks/arcs although sources currently have no task data/details. Stable-key springs use stiffness 210/damping 26/~8ms substeps. One SVG and same-frame ref transforms avoid per-frame React renders and DOM-coordinate correction. Stop rAF at rest.

At most five secondary tentacles appear. Overflow uses four individual bubbles and a fifth aggregate slot in border-strong, opening all active tasks including external sessions as flat rows without bubble shadows. Pending interactions sort first. Within priority, manual local order precedes stable first-observed start order, falling back to first observation and session ID. Phase/headline/snapshot order/later timestamp corrections never reorder.

Pointer drags feed the solver directly on both axes. Only vertical changes reorder. Others yield through springs. Center/spacing remain stable. Release returns items to columns and suppresses clicks. Cancellation restores original order. Tasks stay within node/priority group, support arrow sorting, and exclude aggregate slots. Source/Agent order persists and Agent order is shared with management. Task order is frontend-local.

Bubble width is a persisted preference: narrow 232px, medium 264px (default), or wide 304px. Density is compact 54px, standard 76px (default), or detailed 100px. The title and monospace m:ss or h:mm:ss duration share the first line. Phase and rolling headline share the second. Standard adds the model/effort/Fast pill, project, and right-aligned step trail. Detailed adds previous readable content, a pending-detail hint, or known total duration, plus the source name in the metadata line. Unknown source/configuration fields remain absent. A 16px source badge sits on the phase tile; recorded local CLI uses a neutral terminal glyph.

Auto-compact is enabled by default. More than four tracked tasks reduces density by one level and shows a pill beneath the Agent name when the density changes. Display settings include a live preview and controls for density, width, and auto-compact. The whole bubble opens details, without embedded approval actions. Pending tasks replace time with a pending pill and use warning-soft, a 1.5px warning ring, and a soft halo. Bubble hover lifts slightly with spring overshoot; pressing scales to 0.97. Reduced motion stops movement.

Bubbles retain the rounded font, phase colors, 13px radius, and 30px phase tile. Commands/paths use monospace, with project-relative paths preserving filenames. Empty headline content falls back to recent readable content, title/user message, then a generic title. The headline updates at most once per second with a 160ms/5px upward crossfade.

Shared PhaseTile/PhaseLabel/StepTrail use phase tokens. Running tiles have 1.6s light arcs, labels 2.4s shimmer, latest steps pulse. Arc pseudo-elements rotate inside fixed rounded masks. Shimmer uses static gradient masks with opposing text/overlay transforms. Animate transform only, not gradient angles/background positions each frame. Thinking breathes, terminal underline blinks, editing outlines trace, interaction shields sway every 2.4s, and completion checks trace once at opacity 0.72. External phase tiles remain still. Homepage bubbles have no arrow after time or whole-bubble tooltip. reduced-motion stops decorations.

Running tentacles widen from 2px to 4px before the root flare and use contrasting 3px rounded `1 17` dashes at 1s. Pending uses stationary warning, 1.5px bubble inset border, and a 6px 16% warning halo breathing at 2.4s, with warning outer arc. Recently ended uses stationary translucent success.

When a full backend snapshot removes a session, retain final summary/actual end time as completed. Unread bubbles keep a dot indefinitely and count toward slots/aggregate. This is current-page ARC read state, not native-app/Dock state, and does not persist across reload. Viewing details marks read, including completion while already open. Details retain task data while panel-open behavior hides bubbles. Leaving details waits about 2s before spring fade, port retraction, and slot closure. Elapsed duration remains fixed at actual end. A new turn clears prior completion/unread state. Keep a selected slot visible if it would otherwise overflow.

External transcript tentacles use text-tertiary `3 5` dashes. Ongoing ARC and external sessions show contrasting 3px flow dots on their tentacles. reduced-motion stops the flow. All bubbles open details. Native navigation is in the header. Narrow windows clip bubbles/tentacles with a 32px right fade without shrinking, hiding the whole group, or horizontal scrolling. Visible parts remain clickable. New tasks grow/fade from their outer-arc port.

### Agent view and task details

Agent nodes/overflow open layer one. Bubbles open layer two. Agent headers show quota-ring icon, name, version, connection, verified native link, settings detail, and width toggle. Quota cards reuse windows/reset/pace/credits/refresh with missing-source explanation.

The Agent list contains unarchived conversations ordered by creation time descending, without active/ended filters. Rows show title, creation date, project or current headline, and a neutral conversation icon or live phase tile. Missing live evidence never implies completion. The local agents/conversations operation pages metadata only, default 20 and maximum 50. Codex uses native thread/list with archived:false, created_at descending, and its cursor. Other drivers expose ARC-stored tasks only; a streamed metadata scan runs off the async runtime and is cached for 30 seconds across pages. No timeline or per-row runtime request occurs during listing. Scroll proximity loads the next page without polling or overlap. Rows are memoized and offscreen content uses content-visibility. Details/back retains pages and scroll position. Selecting a row reads agents/conversations/timeline. Unknown Codex histories remain read-only and full-snapshot polling follows the existing external-history interval. The old current-Core ended-task cache is removed.

Mirrored ElasticPanel/panelMorph shells open right from node/bubble, 400px wide with 16px margins and 20px radius. Open ~250ms, close ~160ms, fading content. No scrim/scroll lock/inert. Switch Agents within the shell. Reclick/Escape closes with trigger focus restoration or owning-Agent fallback. Left source views are mutually exclusive. Center dots remain global entry points.

Reserved panel space shifts/compresses the scene without vertical reorder, preserving 40px selected-node/name clearance. Below 760px, overlay mode leaves about 18px of selected-node edge. Pause drag/keyboard reorder while open. All Agent bubbles/tentacles fade toward nodes while outer arcs retain their geometry. Nonselected active nodes show counts with warning for pending. Selected nodes retain normal scale without an outline or halo. Their primary tentacle brightens and a secondary tentacle connects to the panel edge. Closing restores bubbles. reduced-motion switches directly without flow.

Details have Back, a single-line task title with a full-title tooltip, native link, width toggle, status, project, and localized duration. The title omits the Agent name; the metadata row retains it. A second metadata line shows known source/connection information, the latest turn configuration, and turn count. Agent and task layers share the default 400px or viewport-minus-32px width. Forward/back slide slightly in opposite directions over 160ms without shell resizing. Activity-snapshot membership means ongoing, including external sessions whose completion is snapshot removal rather than old item status. Timelines scroll internally with jump-to-latest.

Opening Codex details reads tasks/runtime/{threadId} once for the native task title without loading conversation items or resuming the thread. This title takes precedence over activity/selection titles because bounded transcript tails may omit the original user input. Metadata read failure retains the snapshot title. Other Agents retain their activity/selection titles.

ARC first reads fully, then polls after each completed read plus ~1s with after, without overlap. Expired cursors force full reload. External read-only snapshots refresh fully about every 5s. Leaving details stops polling. Partial coverage is disclosed. Later errors preserve acquired entries.

External Codex uses app-server thread/read includeTurns without ownership/resume/approval registration. Claude transcripts project user/text/thinking/tool/results by stable tool ID, reading at most the last 8 MiB and reporting partial truncation. External responses include readOnly and use full snapshots rather than after. Missing/failed timelines show phase/recent content and a localized explanation directing complete-record inspection to the native Agent. Verified open appears in the header. External sessions offer no approval actions.

Initially scroll to bottom. Follow running work until the user scrolls up. Resume within 24px of bottom. Layout clamping after collapse is not user scrolling. Preserve the final follow at completion, then stop automatic jumps. Completion never closes details.

Approval and Pi choice/input cards appear only in the fixed bottom area, using warning-soft/warning, requester/object, allow-once explanation, and deny/allow actions. Pending cards receive focus. Full-width cards use 14px horizontal padding with explanation left and actions right. File requests use known paths. Only explicitly associated same-turn read/write/edit/create operations classify permission as read/write. Otherwise retain generic file access without inference from titles/paths.

Existing local respond forwarding, submission locks, stable requestId, and receipt state remain. Pending submission spins/disables repeats. Success removes the card while preserving timeline outcome. ACP allows only allow_once and disables allow if absent. Timeline interactions are borderless single lines showing pending object and eventual result. Keep request and execution entries in the work block. Use exact same-turn/object matching only to identify the footer request; never guess ambiguous parallel matches. File/command rows without details have no collapse control. Unknown durations have no placeholder. No extra message box exists except question-answer fields.

### Entry rendering

User messages are right-aligned light bubbles with 14/14/4/14px corners. They default to a three-line preview. Only overflowing messages show Show more / Show less, with disclosure state retained by entry ID during timeline updates. Overflow is measured again when text or panel width changes. Text/thinking use react-markdown/remark-gfm for tables, links, tasks, and code, skipping raw HTML. Links use platform opening. No syntax-highlighting dependency is added. Existing plainMarkdown and other-page rendering remain.

Entries group by turnId. Transcript or turn-less sessions use one stable fallback turn. Each turn shows its primary user prompt, one work block containing every other entry except the final answer, then the final answer as full Markdown. Native text phase:final_answer takes precedence. Completed turns without that marker use the last text entry after the last non-text entry. Intermediate text stays inside work as a muted expandable line. Steering user entries remain inside work rather than being dropped.

Work summaries show stacked kind icons, running/done/waiting state, known duration, operation counts, failures, and a chevron. Thinking, commands, files, tools, plans, interactions, errors, and intermediate text share the same block. Running and waiting blocks default open. Completion collapses the block unless a manual choice exists. Live blocks with more than three steps initially show the latest three; an explicit toggle reveals older steps. Stable turn IDs and entry IDs retain disclosure choices through incremental updates and backfill.

Work steps use one-line kind/title/status/timing summaries. Commands and paths are monospace. Thinking expands as prose beside a thin rule. Command output uses a bounded scrolling monospace box. Plans expand as checklists. Interactions retain their request/result evidence; actions remain in the approval footer. Unknown durations and diff counts remain absent. Reliable turn spans use observed start/end times, never sums of overlapping or incompletely timed steps.

Earlier turns initially collapse to a card showing turn number, known source/model/duration, a one-line prompt, and a two-line answer preview. Expanded earlier turns have an explicit collapse control. The latest turn remains expanded. Expanded turn headers stick to the top of the timeline scroll viewport.

Radix Collapsible owns keyboard/semantics. motion animates height around 180ms. Live reduced-motion changes immediately stop mounted transitions and icon rotation. Expansion affects only timeline content, never polling/cursors/follow behavior/panel shell. All colors use semantic light/dark tokens.

## Native navigation

Navigation support requires actual session readback, not command existence/help. Never modify private indexes. Do not add unverified Windows/Linux CLI routes.

| Agent | Candidate | Current boundary |
| --- | --- | --- |
| Codex | codex://threads/{threadId} | Adapter-built link, opened natively by the backend. External threads become visible after Desktop restarts. No Desktop link on Linux. |
| Claude Code | claude --resume {sessionId} in original cwd | No deep link; no task-open action. |
| Cursor | cursor-agent --resume {sessionId} | Distinct cursor-agent identity required. Generic agent is insufficient. Workspace trust may block session proof, so no open is exposed. |
| Grok | grok --resume {sessionId} | ACP creation alone does not prove CLI same-session content. No open. |
| OpenCode | opencode --session {sessionId} | Can create nonexistent IDs, so successful launch/empty UI does not prove resume. No open without content proof. |
| Pi | pi --session <path-or-id>, ARC session-dir | Empty RPC sessions may lack persisted files. Expected sessionFile paths are not persistence evidence. No open. |
| DeepSeek Harness | dsh tui --resume <session>, ACP profile | ACP creation does not establish a usable tui profile or Desktop session link. No open. |
| Gemini, Copilot, Kimi, Qwen, Kiro, Devin, Cline, Junie, Hermes, Droid, Goose, CodeBuddy, Oh My Pi | Unverified | No integrated verified navigation route. |
