# UI component debt

MUST means a requirement. SHOULD means the default unless a concrete task-specific reason justifies an exception. MAY means an option.

Compose feature UI from the shared primitives, shells, forms, composites and objects described in [Component specification](component-spec.md). Add missing shared patterns with a browser fixture and design-mount export before using them in feature pages.

Run `npm run check:ui` (also part of `npm run check`) to enforce shared controls, DispatchSpec rendering, inline layout ownership and feature CSS selector ownership. Tailwind utilities are the supported replacement for legacy layout selectors.

## Scope

Feature code includes all UI source except `ui/components/ui/**`, `ui/components/composites/**`, `ui/components/objects/**`, `ui/design-mount/**`, scenario/fixture files, and the topology geometry/painters enumerated in `tooling/ui-policy.mjs`. The topology tuning panel remains feature code. Fixture names use a scenario/fixture prefix, a matching directory, or a `.scenario`/`.fixture` suffix.

Raw button, input, select, textarea, label, details, summary and definition-list elements require shared components. Direct model/effort/service-tier reads from `dispatchSummary` or `task` inside JSX require DispatchSpec. Event handlers and data processing outside JSX remain allowed; this syntactic rule does not perform alias/data-flow analysis. Inline margin, padding, gap, display, flex/grid and alignment properties require shared shells. Existing dynamic geometry properties such as top, left, width, height and transform remain allowed. New feature controls use SingleChoice/ChoiceControl rather than importing Select, ToggleGroup or RadioGroup directly. Arbitrary Tailwind color, spacing, radius and typography values are forbidden, including conditional and cn/cva string literals.

Feature CSS selectors are tracked when their names indicate rows, cards, forms, fields, headings, headers, actions, settings or tag clusters, or their direct declarations set spacing, display, flex/grid or alignment. This includes component-local styles and `ui/style.css` / `ui/product.css`. Animation keyframes and the same shared/fixture exclusions are omitted. CSS baselines count individual selectors, including grouped selectors and repeated rules. All dedicated CSS files, including shared legacy CSS, are also compared to the Git debt base: new files and new non-brand selectors fail. Existing selector declarations may evolve during migration; new layout uses Tailwind. `ui/tokens.css` and synthetic fixture CSS are infrastructure exceptions. Brand selector exceptions cover only the mark, topology/earcup connections, quota rings and task bubbles in their existing files.

TASK list and summary-header layout is owned by `ui/components/objects/task/task.css`. Collection layout, timeline bodies and update work grouping retain their feature owners.

Accounts, AGENT catalog/profile/identity objects and quota surroundings compose shared shadcn primitives with Tailwind utilities. Notification binding behavior and task content retain their existing owners. Quota rings remain brand visuals. Account workspace and Agent panel shell selectors remain with the integration owner.

## Remaining migration ownership

| Area | Feature owners | Remaining styles |
| --- | --- | --- |
| Task and activity content | `TasksPage.tsx`, `objects/task/Card.tsx`, `ActivityTimeline.tsx`, `TimelineEntries.tsx`, `TaskOutcome.tsx`, `TaskChanges.tsx`, `TaskOwnership.tsx`; TASK and interaction objects | `ui/components/TaskDetail.css`, `ui/components/activity/activity.css`, task/timeline rules in `ui/product.css`, TASK object CSS; task-bubble styling remains brand-owned |
| Workspace and global shell | `ElasticPanel.tsx`, workspace headers/dock, `ui/components/ui/HoverPreviewGroup.tsx`, `AnimatedSize.tsx` | Global defaults and dialog/workspace rules in `ui/style.css` and `ui/product.css`, the remaining hover/size shared CSS; topology geometry is outside layout migration |

Remote-link pages, setup content, Relay hosting, SRC/TUNNEL objects, authorization requests and deployment progress use shared primitives and Tailwind. Setup dialog geometry and shared object rules still consumed by other areas remain with their listed owners.

File names in the feature-owner column are relative to `ui/components/` unless another prefix is shown. Shared `ui/product.css` and `ui/style.css` need a single integration owner when areas are worked in parallel; feature lanes remove only their named selector families. Primitive and form/shell CSS has moved into Tailwind; these remaining areas do not authorize redesigning topology, quota or notification behavior.

Settings, updates and management use Tailwind and shadcn Table, Popover and Card alongside the shared settings shells. `AppUpdate.css` retains only task-bubble update-blocking visuals for the TASK owner. Workspace sizing and the settings breadcrumb remain with the global shell owner. `settings-extras-light/dark` cover both Extras panes; `management-table-light/dark` cover pagination, row actions and empty tables. Run `node tooling/acceptance/settings-migration.mjs` for fixture-only Chrome geometry and keyboard checks at narrow and wide widths in both themes.

## Cleanup

The baselines and this list MUST only shrink. Never add lint directives, baseline entries or higher counts for new code. ESLint debt is bound to the file, rule, token fingerprint and occurrence count; moving lines or formatting does not grant new allowances. Changed violating fragments and extra copies fail. Remove the corresponding entries/counts when migrating code to shared components; checks report stale entries. Update the table below in the same change. There is no baseline regeneration command.

Local checks reject baseline growth against HEAD. CI MUST set `ARC_UI_DEBT_BASE` to the PR base commit to reject growth across committed changes. The initial baseline is admitted only when that base has no baseline file.

Counts are outstanding violations per file and rule, sorted by count.

<!-- ui-debt:start -->
| File | Rule | Count |
| --- | --- | ---: |
| ui/product.css | shared-layout-css | 282 |
| ui/components/TaskDetail.css | shared-layout-css | 72 |
| ui/style.css | shared-layout-css | 32 |
| ui/components/activity/activity.css | shared-layout-css | 5 |
| ui/components/AppUpdate.css | shared-layout-css | 1 |
<!-- ui-debt:end -->
