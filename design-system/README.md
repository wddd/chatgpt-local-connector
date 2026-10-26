# ARC design system

Mount ARC's actual React controls, quota composites and topology components in Claude Design canvases. The global namespace is **`Arc`**. Renderers and brand assets come from the application; this is not a second component library.

## Build and load

Run `npm run design:bundle` from the repository root. It writes these ignored artifacts to `design-system/dist/`:

| File | Contents |
| --- | --- |
| `arc.js` | IIFE exposing `window.Arc`; React 18 host wrappers and private React 19 islands |
| `arc.css` | Component rules scoped to `.arc-island`, with namespaced animations |
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

## Exports

| Export | Purpose |
| --- | --- |
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

Source types are in `ui/design-mount/host.tsx` and `ui/design-mount/fixtures.ts`. Rebuild against the current shared components whenever their props or styles change. No generated output belongs in Git.
