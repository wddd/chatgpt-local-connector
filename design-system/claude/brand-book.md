# ARC Design System

The real UI components of Agent Remote Control, mounted on design canvases instead of redrawn.

ARC connects cloud control sources (SRC: Claude, ChatGPT, Gemini, Grok…) through connections (TUNNEL) to agents on the user's computer (AGENT: Codex, Claude Code, ACP agents). Its UI is a quiet desktop tool: a homepage topology with side panels, a dock, and compact management sheets. Designs for ARC start from this system.

## Source of truth

This system is generated from the `agent-remote-control` repository. Nothing here is hand-drawn.

| What | Where in the repo |
| --- | --- |
| Components, styles, tokens | `ui/` (the app itself) |
| Claude Design packaging | `design-system/claude/build.mjs`, `npm run design:claude` → `design-system/claude/project/` |
| Bundle build | `design-system/build.mjs`, `npm run design:bundle` → `design-system/dist/` |
| Synthetic data | `ui/design-mount/fixtures.ts` (design-only records) |
| Target component architecture | `docs/dev/component-spec.md` |
| Object model and placement | `docs/dev/object-model.md` (draft) |

When components change, rebuild the bundle and republish this system from the repo. Another Claude account publishes its own copy the same way (see Publishing). Never edit component code here.

## Visual foundations

- **Neutral first.** Surfaces are white/near-black with gray hairlines (`--border`). Text has three levels: `--foreground`, `--muted-foreground`, `--text-tertiary`.
- **One UI accent.** `--brand-accent` marks selection, focus and running work; `--ring` derives from it. shadcn `--accent` is the neutral hover surface. `--brand-orange` belongs to the mark and promotion, never to UI state.
- **Roles have colors.** `--role-source` (SRC, left wing) and `--role-agent` (AGENT, right wing) appear on tags and topology, not as general decoration.
- **Task phases have colors.** `--phase-*` tokens color thinking, command, file, tool and text steps in task bubbles and timelines.
- **Compact density.** Body text 14px (`--text-md`), rows and metadata 13px, captions 12px. Controls are 32–36px tall.
- **Radii by layer.** Controls `--radius-control`, rows `--radius-row`, cards `--radius-card`, panels and dialogs `--radius-panel`, pills `--radius-pill`.
- **Light and dark** are both first-class; every component is shown in both.

Derived colors that use `color-mix()` or `var()` are omitted from the palette and reported by the packager. The components retain these expressions in `components/bundle.css`.

## Component layers

ARC's shadcn/ui and Tailwind v4 foundation supports three composition layers (`docs/dev/component-spec.md`):

1. **Shells**: PlatformIcon, StateBadge, SectionHeader, EntityRow, EntityCard, FactList, Freshness, AddressField, plus the primitives.
2. **Object components**: one per domain object (SRC platform, SRC account, AGENT platform, AGENT account, TUNNEL, TASK, interaction request, authorization request, relay member, deployment progress), each with four variants: **Chip** (inline reference), **Node** (homepage topology), **Row** (panel list entry), **Card** (panel summary).
3. **Composites**: Quota (ring, panel, bubble), RequestCard, DispatchSpec chip.

The current exports include all eight shells, the primitives, quota composites, the topology node and the task bubble. The exports also include SRC, TUNNEL, TASK, AGENT, request, Relay member and deployment objects. Only their implemented variants appear in the export table. A missing pattern belongs in the repository as a shared component with a browser fixture and design export. Add primitives through the pinned shadcn CLI into `ui/components/ui`; use semantic Tailwind utilities and the shared `cn()` helper. Remaining feature CSS is migration debt described in `docs/dev/ui-debt.md`.

## Exports

<!-- exports -->

## Design rules for ARC canvases

- **Use real components wherever one exists.** Quota, task bubbles, nodes, buttons, statuses and tags must be mounted, not redrawn.
- **Use only real data fields.** Each component card lists what it renders. Do not invent fields the app does not have (device lists, histories, counts). Use `Arc.fixtures` for realistic content.
- **New things open in centered dialogs; existing objects are inspected in side panels.** SRC panels dock left, AGENT panels dock right, and drill down L1 (platform) → L2 (account) → L3 (task) in place.
- **References between objects are Chips that navigate**, never free text (for example, an SRC account row shows its connection as a TUNNEL chip that opens the connection).
- **Actions for a section sit in its header**, not on their own line. Destructive actions go to a danger zone at the end.

## Using it on a canvas

The namespace is **`Arc`**. Load order on an artboard, after `support.js`: `components/bundle.css`, `components/bundle.js`. The canvas supplies React 18; do not add React files.

Wrap artboard content in **`Arc.Root`**. It scopes theme (`mode="light"|"dark"`), `locale` (`en`, `zh-CN`), `privacy` and a fixed clock (`now`) to its own element. Only `Arc.Root` accepts nested markup and other `x-import`s; other component exports take plain-text children only, because each runs in its own React 19 island.

Non-string props come from `renderVals()` holes:

```html
<x-import component-from-global-scope="Arc.Root" mode="dark">
  <div style="display:flex;gap:12px;align-items:center">
    <x-import component-from-global-scope="Arc.AgentQuotaIcon" agent="claude" dual="{{yes}}" quota="{{quota}}"></x-import>
    <x-import component-from-global-scope="Arc.AgentQuota" provider="{{snapshot}}" refreshing="{{no}}" on-refresh="{{noop}}"></x-import>
  </div>
</x-import>
```

```js
renderVals() {
  const F = window.Arc.fixtures;
  return { yes: true, no: false, noop: () => {}, quota: F.accounts[0].quota, snapshot: F.quotaSnapshots[0] };
}
```

Built-in navigation, refresh, URL and clipboard actions do not contact ARC. They emit a bubbling `arc:action` event `{ kind, value }` on the enclosing Root.

<a id="fixtures"></a>
### Fixtures

`Arc.fixtures` holds typed synthetic records: `now`, `accounts`, `agents`, `sources`, `ingresses`, `quotaSnapshots`, `quotaStates` (`ready`, `stale`, `refreshing`, `unavailable`, `blocked`, `exhausted`, `unknownReset`, `expiredCredit`, `empty`), `activitySessions`, `activity`, `choices` and `labels`. `requests` holds permission, question, authorization, deployment and member records; `tasks` holds activity, dispatch receipt and timeline records; `agentObjects` holds Agent platform, account, source and connection records. `dispatchSpecs` holds recorded spec/label states, and `tunnelFrames` holds landscape/portrait topology frames. These families are data under the single `Arc.fixtures` entry, not components. Use `requests.now` or `tasks.now` for Root and explicit time props with those families; other records use `Arc.fixtures.now`. Copy a record before changing it for a design state.

## Publishing

1. Optionally run `node design-system/claude/build.mjs --check` to verify design previews. Run `npm run design:bundle`, then `npm run design:claude` in the repository root.
2. Stage `design-system/claude/project/*` in the Claude session, preserving the directory layout. This means session file staging, not Git staging; the generated project is gitignored.
3. Publish the staged files to the account's **Design System**, with `design-system.json` last. Another account publishes its own copy. Set the published system as the default when needed.
