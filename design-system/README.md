# ARC design system

Mount ARC's actual React controls, quota composites and topology components in Claude Design canvases. The global namespace is **`Arc`**. Renderers and brand assets come from the application; this is not a second component library.

## Foundation

The mounted controls are the app's shadcn/ui source backed by Radix and Tailwind v4. `components.json` points the CLI at `ui/components/ui`; add primitives with `node node_modules/shadcn/dist/index.js add <name>` and adapt them there using `cn()` from `ui/lib/utils.ts`. Public Arc exports preserve their existing props. See [the token map and CLI workflow](../docs/dev/ui.md#shadcn-and-tailwind-foundation) and [remaining CSS owners](../docs/dev/ui-debt.md#remaining-migration-ownership).

The bundle compiles `ui/tokens.css` with the same official Tailwind Vite plugin as the desktop frontend and fixtures. It scopes the reset and utilities so host canvases keep their own layout, typography and controls. Floating Radix content stays inside its island. Use semantic `background`/`foreground`, `card`, `primary`, `muted`, `accent`, `destructive` and `ring` variables; `brand-accent` names ARC's selected colored accent, while `accent` is the neutral hover fill. Role, task-phase, quota and brand tokens retain their current palette.

## Build and load

Run `npm run design:bundle` from the repository root. It writes these ignored artifacts to `design-system/dist/`:

| File | Contents |
| --- | --- |
| `arc.js` | IIFE exposing `window.Arc`; React 18 host wrappers and private React 19 islands |
| `arc.css` | Tailwind preflight/utilities scoped to `.arc-root`, component rules scoped to `.arc-island`, with namespaced animations |
| `tokens.css` | Theme variables extracted from `ui/tokens.css`, scoped to `.arc-root` |
| `tokens.json` | Theme token maps, theme colors, type scale, font families, spacing and radii |

Load in this order. The canvas already supplies `window.React` and `window.ReactDOM` version 18; **do not add React script files to the canvas**.

```html
<link rel="stylesheet" href="./design-system/dist/tokens.css">
<link rel="stylesheet" href="./design-system/dist/arc.css">
<script src="./design-system/dist/arc.js"></script>
```

Token JSON retains CSS expressions such as `var()` and `color-mix()`. The `colors` maps select the appropriate branch of literal `light-dark()` colors. The `themes` maps preserve source expressions. Root uses the default ARC accent palette.

## Publishing to Claude Design

Run `npm run design:bundle`, then `npm run design:claude`. The Node packager writes the gitignored `design-system/claude/project/` with literal color tokens, the shared bundle, and a README and preview for every current component export. It reports omitted CSS color expressions and fails on missing component documentation or previews and unsafe inline bundle delimiters.

Stage `design-system/claude/project/*` in the Claude session, preserving its directory layout. Publish to the account's **Design System**, with `design-system.json` last. The generated `README.md` contains the brand book and publishing steps. Generated files do not belong in Git.

## Provider rule

Wrap every mounted component in `Arc.Root`. Use a separate Root for each independently configured artboard. It supplies `mode`, `locale`, `privacy` and a fixed `now` in epoch milliseconds. It sets attributes on its own element, never on the host document. Native service calls and preferences are replaced with memory-only design adapters. Reduced motion is enabled for deterministic mounts.

Canvas examples use `{{name}}` template holes resolved from the canvas `renderVals` object. Kebab-case attributes become camelCase props. Pass booleans, numbers, objects and callbacks through holes; `privacy="false"` is a string, not a boolean. Define the named values before rendering; do not wrap the markup in an `html` template tag.

```js
const renderVals = {
  privacy: false, now: Arc.fixtures.now,
  quota: Arc.fixtures.quotaSnapshots[0], refreshing: false, refresh: () => {},
};
```

```html
<x-import component-from-global-scope="Arc.Root"
  mode="light" locale="en" privacy="{{privacy}}" now="{{now}}">
  <x-import component-from-global-scope="Arc.AgentQuota"
    provider="{{quota}}" refreshing="{{refreshing}}" on-refresh="{{refresh}}"></x-import>
</x-import>
```

Root accepts ordinary host React children, including multiple `x-import` elements. Every other component accepts **plain text children and text slots only**. Do not pass React 18 elements, component functions, refs or render props into a React 19 island. Lucide icon props use the names `RefreshCw`, `Plus`, `Check`, `X`, `Info`, `Plug` or `Bot`, resolved to real Lucide components inside the island. `SingleChoice` option icons, `StateBadge.presentation.icon` and `PlatformIcon.fallback` use those names too. `EntityCard.icon` is a plain-text slot, not a Lucide icon name. Nested FactList labels, values and missing placeholders are text only. `SectionHeader.titleProps` accepts heading attributes without children, refs or HTML injection. `EntityCard.asChild` and `SectionHeader.titleAsChild` support only false because their element composition cannot cross the island boundary. Settings/form shells and DispatchSpec are also exported. Form controls and actions use text stand-ins in individual islands; browser fixtures show their real composition.

Controlled inputs still require the owner to update their props from `onChange`. Explicit callbacks run normally. Built-in task selection, quota refresh and platform-adapter URL/clipboard actions emit a bubbling `arc:action` CustomEvent on the enclosing Root with `{ kind, value }`; these adapters do not contact ARC, navigate or write to the clipboard. Listen for that event to visualize design interactions. AddressField calls the owner's `onCopy` callback for its button and retains native selection-copy of its raw value; its `display` text and reveal state are owner-controlled. `now` is fixed until the owner changes it. Keep fixture timestamps aligned with it.

DispatchSpec accepts recorded task/turn data and native-shaped label snapshots. `Arc.fixtures.dispatchSpecs` covers resolved, unresolved, missing, loading and failed catalogs, including dsh and historical turns.

All synthetic records use the single `Arc.fixtures` entry. `requests` contains permission, question, authorization, deployment and member records; `tasks` contains activity, dispatch receipt and timeline records; `agentObjects` contains platform, account, source and connection records. The existing top-level fixture fields remain available. Set Root and explicit time props to `Arc.fixtures.requests.now` or `Arc.fixtures.tasks.now` for those families. See [fixtures](api/components/fixtures.md).

`npm run check` runs the Claude Design missing-preview check directly from `ui/design-mount.ts`, using the same enumeration as `npm run design:claude` without requiring a bundle. Add a recipe in `design-system/claude/previews.mjs`, a component card below and an export-table row whenever adding a component export.

## Exports

| Export | Purpose |
| --- | --- |
| [RequestCard](api/components/RequestCard.md) | Request presentation and response frame |
| [InteractionRequestCard](api/components/InteractionRequestCard.md) | Agent permission and question response |
| [InteractionRequestChip](api/components/InteractionRequestChip.md) | Interaction reference and response status |
| [InteractionRequestRow](api/components/InteractionRequestRow.md) | Recorded interaction outcome |
| [AuthorizationRequestCard](api/components/AuthorizationRequestCard.md) | Source authorization decision |
| [AuthorizationRequestChip](api/components/AuthorizationRequestChip.md) | Authorization reference and status |
| [AuthorizationRequestRow](api/components/AuthorizationRequestRow.md) | Authorization list and choice presentation |
| [DeploymentProgressCard](api/components/DeploymentProgressCard.md) | Relay deployment steps and recovery |
| [DeploymentProgressChip](api/components/DeploymentProgressChip.md) | Relay deployment reference and phase |
| [TaskChip](api/components/TaskChip.md) | Task reference and recorded state |
| [TaskNode](api/components/TaskNode.md) | Task topology activity and attention |
| [TaskRow](api/components/TaskRow.md) | Activity, receipt and dispatch rows |
| [TaskCard](api/components/TaskCard.md) | Task summary and host-owned detail body |
| [AgentPlatformChip](api/components/AgentPlatformChip.md) | Agent platform reference |
| [AgentPlatformNode](api/components/AgentPlatformNode.md) | Agent platform topology adapter |
| [AgentPlatformRow](api/components/AgentPlatformRow.md) | Agent platform list presentation |
| [AgentPlatformCard](api/components/AgentPlatformCard.md) | Agent catalog, detail and panel summary |
| [AgentAccountChip](api/components/AgentAccountChip.md) | Agent account reference and profile states |
| [AgentAccountNode](api/components/AgentAccountNode.md) | Agent account topology adapter |
| [AgentAccountRow](api/components/AgentAccountRow.md) | Agent account identity and roles |
| [AgentAccountCard](api/components/AgentAccountCard.md) | Agent account identity and profile controls |
| [SrcPlatformChip](api/components/SrcPlatformChip.md) | Source platform reference |
| [SrcPlatformNode](api/components/SrcPlatformNode.md) | Source platform topology adapter |
| [SrcPlatformRow](api/components/SrcPlatformRow.md) | Source platform list and choice presentation |
| [SrcPlatformCard](api/components/SrcPlatformCard.md) | Source platform summary and detail |
| [SrcAccountChip](api/components/SrcAccountChip.md) | Source identity reference |
| [SrcAccountNode](api/components/SrcAccountNode.md) | Source identity topology adapter |
| [SrcAccountRow](api/components/SrcAccountRow.md) | Source identity list and choice presentation |
| [SrcAccountCard](api/components/SrcAccountCard.md) | Source identity summary and detail |
| [TunnelChip](api/components/TunnelChip.md) | Connection reference |
| [TunnelNode](api/components/TunnelNode.md) | Connection topology adapter |
| [TunnelRow](api/components/TunnelRow.md) | Connection list and choice presentation |
| [TunnelCard](api/components/TunnelCard.md) | Connection summary and detail |
| [ChoiceControl](api/components/ChoiceControl.md) | Static settings value for zero or one option; SingleChoice otherwise |
| [SettingsSection](api/components/SettingsSection.md) | Settings heading and body |
| [SettingRow](api/components/SettingRow.md) | Aligned control or content-sized navigation row |
| [FormField](api/components/FormField.md) | Label, control, help and error |
| [FormSection](api/components/FormSection.md) | Semantic field grouping |
| [ViewStack](api/components/ViewStack.md) | Retained full-height panel views |
| [MeterSegment](api/components/MeterSegment.md) | Interactive weighted meter segment |
| [ActionGroup](api/components/ActionGroup.md) | Wrapping button layout |
| [Disclosure](api/components/Disclosure.md) | Accessible collapsible section |
| [DangerZone](api/components/DangerZone.md) | Destructive actions and consequence |
| [DispatchSpec](api/components/DispatchSpec.md) | Recorded spec with Agent-native labels |
| [Root](api/components/Root.md) | Artboard environment and isolation |
| [Button](api/components/Button.md) | Primary, secondary, ghost, link and destructive actions |
| [IconButton](api/components/IconButton.md) | Accessible icon action |
| [Switch](api/components/Switch.md) | Controlled boolean |
| [SingleChoice](api/components/SingleChoice.md) | Responsive pills or dropdown; existing layout variants |
| [Notice](api/components/Notice.md) | Privacy-aware feedback |
| [Empty](api/components/Empty.md) | Empty collection state |
| [Loading](api/components/Loading.md) | Loading state |
| [Status](api/components/Status.md) | Semantic status dot and label |
| [Tag](api/components/Tag.md) | Source or Agent tag |
| [AgentQuotaIcon](api/components/AgentQuotaIcon.md) | Single/dual ring and Agent logo |
| [AgentQuota](api/components/AgentQuota.md) | Compact two-window quota panel |
| [QuotaBubble](api/components/QuotaBubble.md) | Full quota detail and disclosures |
| [GraphNode](api/components/GraphNode.md) | Existing topology node button |
| [ActivityBubble](api/components/ActivityBubble.md) | Compact, standard and detailed task nodes |
| [PlatformIcon](api/components/PlatformIcon.md) | Source, Agent and provider branding |
| [StateBadge](api/components/StateBadge.md) | Explicit domain presentation and status variants |
| [SectionHeader](api/components/SectionHeader.md) | Heading hierarchy and text slots |
| [EntityRow](api/components/EntityRow.md) | Static, action or navigation row |
| [EntityCard](api/components/EntityCard.md) | Titled entity surface with footer and danger slots |
| [FactList](api/components/FactList.md) | Facts with explicit missing-value policy |
| [Freshness](api/components/Freshness.md) | Observation age and refresh action |
| [AddressField](api/components/AddressField.md) | Read-only address, reveal and copy actions |
| [fixtures](api/components/fixtures.md) | Typed synthetic domain records and quota states |

## React compatibility boundary

This bundle uses **option B**. `ui/components/ui/index.tsx` implements Button with React 19's ordinary `ref` prop. AgentQuota and QuotaBubble pass callback refs through Button/IconButton to register UsageHistory anchors. A React 18 render would discard these refs, breaking disclosures even if the initial markup appeared correct. The reviewed exports do not use `use()`, form actions, `useOptimistic`, `useActionState`, context-as-provider syntax or document metadata; ref semantics alone rule out option A for this batch.

Host wrappers import React as an external mapped to `window.React`. Each wrapper creates only a host element in the React 18 tree, then uses `createRoot` from a private React 19 runtime for the actual renderer. Updates synchronize props; unmount removes that island. Each Root has its own runtime module state, so locale, privacy, clock and preferences cannot leak between artboards. The runtime factory is ordinary bundled JavaScript, without eval. Select and quota portals stay inside their island and inherit the correct scoped theme.

This preserves product rendering and interactions while trading bundle/runtime size and cross-version rich-child composition for reliable mounting. When the shared primitives no longer depend on React 19 semantics, re-audit the entire export graph and run the React 18 preview before replacing these islands with externals. Do not remove only the private React dependency.

## Local preview

```sh
npm run check
npm run design:bundle
python3 -m http.server 5198 --bind 127.0.0.1 --directory design-system
```

Open `http://127.0.0.1:5198/preview.html`. This standalone fixture page loads React/ReactDOM **18.3.1 development UMD from a CDN**, mounts every component in light and dark under StrictMode, and includes all activity densities, platform roles, badge variants, text slots, and extra quota states. Reveal/copy and refresh callbacks remain controlled by the preview owner. The CDN scripts are preview dependencies only. It neither launches nor connects to the desktop app. The page uses ordinary React to exercise the same exported functions; the canvas owns the `x-import` parser.

Source types are in `ui/design-mount/host.tsx`; `ui/design-mount/fixtures.ts` collects the typed fixture families. Rebuild against the current shared components whenever their props or styles change. No generated output belongs in Git.

AGENT platform and account objects export Chip, Node, Row and Card from `ui/design-mount`, with typed `Arc.fixtures.agentObjects` records. Card content/action slots are plain text in individual islands; browser `agent-objects-*` fixtures demonstrate live composition, profile selection, privacy, errors and unchanged quota composites. SRC Cards compose current authorization Chips and pending authorization Rows from supplied connections. No grant history is mounted.
