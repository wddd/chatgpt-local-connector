# UI conventions

[Remote link design and phases](remote-link.md) · [Development](development.md) · [Architecture](architecture.md)

React renders. Tauri/Rust owns configuration, connections, tasks, authentication, native windows, and updates. The main window shares semantic tokens, preferences, and controls.

## Homepage and layout

The homepage uses the ARC mark and arc-shaped earcup connections in both themes. Five two-color palettes are ARC, cyan/blue, pink/purple, red/orange, and yellow/green. ARC retains orange and blue-purple gradients. Other palettes apply to the control-source and Agent sides.

ui/topology/solve.ts is the pure geometry owner. Wings share a mirrored algorithm. Initialize SVG and ResizeObserver after container refs commit. Solve only after a nonzero real viewport exists. Resizing recomputes geometry with spring transitions. Ports follow target direction with angular spacing. Earcups/outer arcs fit port ranges. Primary/secondary tentacles widen toward the root by arc length. Connecting shows root fade and moving dashes. Errors use semantic error color and background breaks. Disconnected/disabled nodes have no primary line and faded icons/names. Center-dot entry points do not participate in connections. Primary tentacles end at earcups with space before the dots.

The animator integrates stable-key center/radius, earcup extent, node position/scale/opacity/ports, outer arcs, and task primitives with stiffness 210, damping 26, and roughly 8ms substeps. Each frame recomputes tentacles/arcs. One SVG draws connections. HTML nodes and fixed-size bubbles receive same-frame transforms through refs. Topology animation neither renders React each frame nor reads node DOM coordinates or uses layout projection. rAF stops when stationary. reduced-motion switches positions directly and stops flow. Runtime media-query changes apply immediately.

Without tasks, both wings use normal nodes, 78px rows, and a 56px compression minimum without shrinking, fading, or indenting Agents. Default node size is 44px, adjustable 32-60px. Icons, quota rings, endpoints, and outer arcs scale together. Brand icons without quota rings default to 38px. With tasks, Agent rows use 78px base/44px minimum. Active nodes scale to 1.1 relative to normal left nodes. Idle Agents remain scale 1 with normal rows and no indent when space permits. Only insufficient vertical row height or horizontal spacing shrinks them, default minimum 0.6 adjustable down to 0.4, with up to 22px centerward indent and opacity 0.62. Active nodes stay at 1.1. Outer arcs follow radius.

Wings independently compress rows. Active row height is max(wing base row height, n × 64 + 10), with 12px gaps. Scene height is max(viewport height, larger wing height + 140). Column spacing defaults to 2.6, adjustable 2.0-3.2. Columns center vertically. Horizontal fitting compresses left spacing, then right spacing, then balances the center with bubble weight 0.8 and a 40px viewport margin. Remaining overflow preserves the left wing and clips the right, with vertical scrolling. The center retains brand assets and earcup spacing.

Node names stay below and ellipsize. Add/manage controls occupy the ARC endpoint dots outside sorting. Do not add trailing helper buttons, coordinates, or empty-column placeholders. Pointer Events update solver drag inputs directly. Items follow both axes, but only vertical changes reorder. Other items yield through springs. Dragging does not change center balance/column spacing. Release saves order and springs back to the column. Homepage dragging uses no Motion Reorder or layout projection. Tasks reorder only within their node and pending-priority group. Aggregate slots cannot reorder. Nodes/tasks support up/down keys. Suppress click after drag. Escape/pointer cancellation restores order. Source order persists. Enabled Agent order is shared with management. Hidden items keep relative order. Task order is frontend-local. Pending tasks remain first. Top toggles keep simple tactile state changes without text, outer glow, or star decoration.

Source, add, Agent, and management nodes can expand into panels. Agent outer arcs and secondary tentacles connect fixed 232 × 54px task bubbles, up to five slots with overflow summarized in the fifth. Narrow windows clip the right with a 32px fade. Every bubble opens details, including external sessions, without a whole-bubble tooltip or trailing time arrow. Native-app navigation uses header icons in Agent/task views. External sessions retain dashed tentacles, read-only timelines or summaries, and no approvals. Ongoing sessions show contrasting 3px flow dots on secondary tentacles, including external dashed connections. The second line prefers current content, then readable text/command/file, then title/user message. Fallback text uses text-tertiary. ARC questions/approvals appear only at the bottom of details without stacked/expanded/count badges.

Node clicks expand outward. Center dots expand global entry points inward. Agent nodes and overflow open the right Agent view. Bubbles enter that Agent's task-details layer. Back returns to Agent view. Shared ElasticPanel/panelMorph shells mirror left/right. Side panels default to 400px with 16px outer margins. Their header width toggle expands to the viewport width minus 32px or restores the default, with a 180ms transition. Agent and task layers share the width state. Opening takes roughly 250ms and closing 160ms, with content fade. Internal forward/back uses 160ms slight horizontal movement without shell morphing. Homepage Agent nodes no longer open centered AgentDetails. Settings details remain independent.

Agent panels have no scrim, scene scroll lock, or background inert. Another Agent on the same side switches content. Clicking the selected node closes. Clicking outside the topmost side panel dismisses it unless it is busy. Node and center-entry clicks retain their own switch or toggle behavior. Escape closes and restores trigger focus, falling back to the owning node if the trigger disappeared. Source views mirror the panel. Center entry points retain their behavior. Reserved panel space compresses columns and shifts the scene without changing vertical slots/order. Selected nodes and names keep at least 40px from the panel edge. Below 760px, overlay mode leaves roughly an 18px selected-node edge. Either panel pauses dragging and keyboard sorting until closed.

Opening an Agent panel fades all task bubbles/secondary tentacles slightly toward nodes while preserving secondary outer arcs. Nonselected nodes with running tasks show counts, using warning for pending work. Selected nodes retain their normal scale without an outline or halo. Their primary tentacle becomes brighter and a secondary tentacle connects to the panel edge. Closing restores bubbles. Agent views reuse quota cards and list unarchived conversations by creation time, newest first, without active/ended filters or manual task order. The local agents/conversations endpoint returns 20 metadata rows per request, capped at 50, with an opaque nextCursor. Codex reads native unarchived threads. Other Agents expose ARC-stored tasks only because their drivers have no native history/archive contract. The frontend appends pages near the scroll boundary, memoizes rows, and uses content-visibility for offscreen content. Hidden lists stop requesting pages. Metadata stays mounted across details/back navigation. Timelines load only after selection; listing never resumes sessions or reads each conversation timeline. The old current-Core ended-task cache is removed.

Source panels are 400px with 16px left/top/bottom margins and the same shell/focus behavior. Left/right views are mutually exclusive and switch directly across sides. Left reservation shifts the scene right and compresses spacing. Selected source/name stays 40px from the panel's right edge. Right bubbles remain visible with existing clipping/fade. The selected source retains its normal scale without an outline or halo, with a brighter primary tentacle and flowing connection to the panel edge. Narrow/reduced-motion behavior matches Agent views.

Source layer one shows the source's product icon, editable-store label, connection enable switch when it carries only one active source, and width toggle. Recent dispatches use `origin.sourceId`, falling back only to `task.origin.sourceId`. Manage opens that source's detail in Remote link. Connection editing requested by `navigation.ingressEdit` still embeds IngressDialog; saving returns to the source panel and starts the connection.

The homepage reads the source management API and renders one node per non-pending, non-revoked source, including several sources on one connection. Node selection, persisted ordering, and dispatch filtering use source IDs. Client self-reported names are diagnostic facts, never identity keys. Do not infer provenance for older unattributed records.

Recent dispatches reveal eight more rows near the scroll boundary. Existing APIs expose Codex dispatches only. Only the latest dispatch per conversation links current status, including newer dispatches from another source. Activity snapshots precede tasks/runtime/{id}. A completed receipt is not task completion. Missing fresh runtime evidence shows unconfirmed status. Running/readable pending rows enter Agent task details across sides. Do not add a separate all-records action.

Remote link's primary list contains product icon, source label, connection chip, and state. A persisted SingleChoice switches All / By platform. Pending reauthorization notices above the list open pairing-code approval with New source / Reauthorize choices. Source detail is nested inside the workspace, with a back arrow in the top header. Label saves on blur or Enter. Product correction uses common-product SingleChoice pills and an overflow dropdown. The connection card shows name, kind, other source labels, and address copy. Facts show authorized time, last seen, and the client self-reported name. Recent dispatches reuse SourceDispatches. Disconnect has a danger action and confirmation; history remains.

Connections below the primary list show every ingress, including unused ones, with kind icon, name, address or provider, source count, and state. Details expose address copy, provider, dedicated-tunnel editing, relay retry/update, joined-relay Leave, and New connection. The flat Approved list is removed. Relay sharing, members, and owner Delete are temporarily placed in Settings under Relay hosting until the separate Extras workspace replaces this placement in P2.

The left center dot, Remote link Add, and Welcome's add action share AddControlSource. Its four-segment header tracks Product, Connection, Setup, and Approval without resizing the panel. The product grid uses SingleChoice with brand icons, including Grok Bot, Claude Code/Desktop, and Other MCP client. Existing connections come first; a relay link is recommended when present. New routes are Create my relay, Paste relay link, Dedicated tunnel, ChatGPT-only OpenAI Secure Tunnel, and Claude Code/Desktop-only Local. Step two retains RelayProgress and puts custom address and Send to Codex under Advanced. IngressDialog receives the selected product and transport.

Setup shows address copy, the registry's product settings path and link, and a waiting state. Approval shows pairing code, client self-reported name and callback, optional new-source label, and Approve/Deny. Reauthorization uses source claim and preserves the chosen source's history. Multiple pending requests remain individually selectable. Non-OAuth connections explicitly disclose that pairing-code approval does not apply and that the connection carries one source. Welcome retains login and permission readiness and opens the shared add flow.

Activity phases never change ordering. Completed unread bubbles remain until details are viewed. After leaving details, they remain about 2s then fade. Completion while details are open counts as read immediately. Details retain acquired results until that layer is left. Unread state neither persists across reload nor synchronizes native-app badges. reduced-motion switches directly and stops flow. See [Task tracking](task-tracking.md#homepage-ui).

Workspace panels for tasks, records, remote links, permissions, and settings have top title bars with title left and width/close controls right. Opening/closing uses at most 180ms fades and slight movement. Internal steps and nested dialogs switch content without morphing the whole panel.

The bottom-left capsule contains Tasks, Records, Remote link, Permissions & readiness, and Settings. Remote link owns control sources and their connections. Settings contains behavior, general preferences, network, experimental topology controls, temporary Relay hosting, and updates. The permission workspace shares status with its icon: ShieldCheck only when applicable permissions/environment are ready, ShieldAlert for missing/unknown/read failures. Refresh and refocus recheck without requesting grants. Only corresponding page buttons request authorization.

The left center dot opens the shared Add a control source flow. Welcome appears automatically on first run without sources. The right dot opens Agent management. Both are Tab-focusable buttons with at least 28px hit targets and restore focus after inward panel expansion. Brand arcs are decorative. Dots use source color/Agent gradient. Hovering the mark or keyboard-focusing either dot shows both SVG-mask symbols: plus left, ellipsis right, or plus right without Agents. Symbols spring from slight rotation/scale over about 300ms. Mark hover or dot keyboard focus scales both dots to 1.1. The individually hovered/focused dot scales to 1.25 with same-color soft glow. Empty sides keep symbols visible with 2s expanding ripples and localized 12px tertiary add-source/add-Agent hints outside earcups. reduced-motion disables ripple/scale/rotation transitions and switches symbols directly.

## Experimental topology controls

Settings → Experimental → Homepage topology controls opens a floating panel, initially collapsed in a corner. Position/expanded state persist in preferences. Drag the handle or use arrows for 8px movement and Shift+arrows for 32px. Resizing confines it to the viewport. The parameter list scrolls internally.

solve.ts PARAMETERS owns keys, groups, localized labels, ranges, steps, and defaults. Six groups show sliders and number inputs. Right-side line arrows expand groups/JSON import with 160ms height/opacity transitions, direct under reduced-motion. Dots mark overrides. Reset works per item or globally. Sliders support arrows/Home/End. Preview immediately and save on release, keyboard change, or input completion. Position/shape changes use existing springs with same-frame connection geometry. reduced-motion takes precedence over slow motion.

Preferences store `{ "schemaVersion": 1, "overrides": {} }`, only for nondefault values. Untouched values follow upgraded defaults. Disabling the panel hides it without disabling saved parameters. Guides and slow motion are session-only.

Copy JSON exports overrides. Import replaces the entire override set, restoring omitted defaults. Reject invalid JSON, unknown versions/fields, and nonfinite values without partial application. Clamp finite out-of-range values and explain. Number inputs also clamp. Empty/nonnumeric input restores that default with feedback. Slider step controls increments without snapping valid typed values.

SVG guides show current control points, tangents, viewport center, and center offset. L/R shows target equivalent wing widths and column-spacing ratios. Slow motion ×0.25 slows geometry springs and line flow while dragged items follow the pointer normally. Guides ignore hit testing. Stationary scenes stop rAF.

## Controls and forms

Reuse Button, Input, Slider, Field, SingleChoice, Switch, Dialog, Tooltip, Popover, menus, tables, and feedback from ui/components/ui/index.tsx. Radix owns selection, keyboard, focus, dismissal layers, Portal, and modal interaction. Layout components only arrange content.

- SingleChoice uses pills for at most five options when space permits, otherwise dropdowns. Remote-link routes use its card style and Radix navigation.
- Native forms default to one column with labels above. Only short related fields share rows.
- Field errors remain associated with inputs. Failed submission focuses the first error and preserves input.
- Dialog has an accessible title, scrolling content, and separate actions. Back removes one layer while retaining form/scroll state.
- Escape closes one layer and restores trigger focus. Async work may temporarily disable closing.
- Icon buttons have accessible names. Disabled/loading/empty/expired/failure/success states reflect real responses.

## Theme and motion

ui/tokens.css owns semantic colors, type, spacing, radii, dimensions, and shadows. ui/theme.ts follows the system by default. Explicit light/dark overrides use opaque white/black canvases. System fonts use 13-14px body, 12px metadata, and 14px reading text. IDs/credentials use shared monospace styling.

Functional icons use shared Icon with Lucide at 16/20px and 1.75px strokes. Brands retain their assets. ui/style.css owns controls. ui/product.css owns product layout.

Related tooltips remain mounted and move/resize continuously between triggers. HoverScope uses shared spring highlights following pointer, keyboard, and Radix state. reduced-motion removes unnecessary transitions.

## Functional pages

Tasks use compact rows with title, project, time, plain-text preview, and necessary runtime/error states. Model/effort belong in details. React renders titles, code, and lists without executing raw HTML.

Records show time, available source name, tool/op, and result. Consecutive successes for one ingress/op may merge counts. Missing origins are not inferred. Recent counts use bounded raw logs without estimated request durations.

Connections open details before editing. Forms own provider/domain/credentials/authentication. Existing policy changes save immediately, except custom lists apply after confirmation. Name/policy/auto-start edits preserve OAuth grants and live connections. Fixed tools remain guide/query/act. Lists target ops, showing query/act ownership and local availability. Domain fields omit scheme/port/path. Service assembles MCP URLs. Blank existing-secret fields retain values. OAuth consent, denial, and revocation are explicit actions.

Agents distinguish installed cards from compact uninstalled rows. Details show versions, discovery errors, and quota. Homepage follows Agent order rather than provider order. Installed enabled cards use Motion Reorder in the management multi-column layout, following the pointer while neighbors yield. Drag starts only outside clickable controls. Icons/links/switches retain clicks. Focused cards also support arrow sorting. Management/homepage share persisted order. Versions ellipsize with hover disclosure. Uninstalled entries link official installation. Display settings only control homepage Agent count.

## Subscription quota

Homepage and Agent settings use AgentQuotaIcon in QuotaRing. Agent panels use QuotaBubble. Retain plan links, window readings, reset times, pace, time ticks, credit-expiry details, and product usage. UsageHistory owns hover/focus spring following, collision placement, and layered Escape. Panel tooltips use compact padding, content sizing, no arrow tip, and top-center placement with collision avoidance. No historical charts are drawn. Quota overview reuses the same cards.

Settings retain homepage count, remaining/used, countdown/date, enablement, and refresh interval. Sources participate automatically by Agent. Quota data appears by default when available. Homepage rings use weekly quota only and disappear without it. Details retain other upstream windows. No local usage periods, tokens, or money display.

## Update notification

Only the primary button shows download size/progress. Do not add a body progress area. Completion changes the button to the localized install-update action. Installation requires another click.

## Verification

Check light/dark, narrow windows, long Chinese/English text, keyboard traversal, layered Escape, focus restoration, and field errors. Run existing checks without adding unit tests. Browsers verify rendering. Installed WebView, tray, and lifecycle require separate real acceptance.
