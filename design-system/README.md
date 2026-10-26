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

## Provider rule

Wrap every mounted component in `Arc.Root`. Use a separate Root for each independently configured artboard. It supplies `mode`, `locale`, `privacy` and a fixed `now` in epoch milliseconds. It sets attributes on its own element, never on the host document. Native service calls and preferences are replaced with memory-only design adapters. Reduced motion is enabled for deterministic mounts.

The examples use the canvas `html` template tag. Kebab-case attributes become camelCase props. Pass booleans, numbers, objects and callbacks through template holes; `privacy="false"` is a string, not a boolean.

```js
html`<x-import component-from-global-scope="Arc.Root"
  mode="light" locale="en" privacy=${false} now=${Arc.fixtures.now}>
  <x-import component-from-global-scope="Arc.AgentQuota"
    provider=${Arc.fixtures.quotaSnapshots[0]}
    refreshing=${false} on-refresh=${() => {}}></x-import>
</x-import>`
```

Root accepts ordinary host React children, including multiple `x-import` elements. Every other component accepts **plain text children and text slots only**. Do not pass React 18 elements, component functions, refs or render props into a React 19 island. Icon props use the names `RefreshCw`, `Plus`, `Check`, `X` or `Info`, resolved to real Lucide components inside the island. `SingleChoice` option icons use those names too.

Controlled inputs still require the owner to update their props from `onChange`. Explicit callbacks run normally. Built-in task selection, quota refresh, URL and clipboard actions emit a bubbling `arc:action` CustomEvent on the enclosing Root with `{ kind, value }`; they do not contact ARC, navigate or write to the clipboard. Listen for that event to visualize design interactions. `now` is fixed until the owner changes it. Keep fixture timestamps aligned with it.

## Exports

| Export | Purpose |
| --- | --- |
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
| [SourceIcon](api/components/SourceIcon.md) | Current platform icon renderer |
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

Open `http://127.0.0.1:5198/preview.html`. This standalone fixture page loads React/ReactDOM **18.3.1 development UMD from a CDN**, mounts every component in light and dark under StrictMode, and includes all activity densities and extra quota states. The CDN scripts are preview dependencies only. It neither launches nor connects to the desktop app. The page uses ordinary React to exercise the same exported functions; the canvas owns the `x-import` parser.

Source types are in `ui/design-mount/host.tsx` and `ui/design-mount/fixtures.ts`. Rebuild against the current shared components whenever their props or styles change. No generated output belongs in Git.
