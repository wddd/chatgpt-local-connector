# UI component debt

MUST means a requirement. SHOULD means the default unless a concrete task-specific reason justifies an exception. MAY means an option.

Compose feature UI from the shared primitives, shells, forms, composites and objects described in [Component specification](component-spec.md). Add missing shared patterns with a browser fixture and design-mount export before using them in feature pages.

Run `npm run check:ui` (also part of `npm run check`) to enforce shared controls, DispatchSpec rendering, inline layout ownership and feature CSS selector ownership. No UI source migration is required to use these checks.

## Scope

Feature code includes all UI source except `ui/components/ui/**`, `ui/components/composites/**`, `ui/components/objects/**`, `ui/design-mount/**`, scenario/fixture files, and the topology geometry/painters enumerated in `tooling/ui-policy.mjs`. The topology tuning panel remains feature code. Fixture names use a scenario/fixture prefix, a matching directory, or a `.scenario`/`.fixture` suffix.

Raw button, input, select, textarea, label, details, summary and definition-list elements require shared components. Direct model/effort/service-tier reads from `dispatchSummary` or `task` inside JSX require DispatchSpec. Event handlers and data processing outside JSX remain allowed; this syntactic rule does not perform alias/data-flow analysis. Inline margin, padding, gap, display, flex/grid and alignment properties require shared shells. Geometry properties such as top, left, width, height and transform remain allowed.

Feature CSS selectors are tracked when their names indicate rows, cards, forms, fields, headings, headers, actions, settings or tag clusters, or their direct declarations set spacing, display, flex/grid or alignment. This includes component-local styles and `ui/style.css` / `ui/product.css`. Animation keyframes and the same shared/fixture exclusions are omitted. CSS baselines count individual selectors, including grouped selectors and repeated rules. Existing selector declarations may evolve; new matching selectors and extra occurrences require shared ownership.

TASK list and summary-header layout is owned by `ui/components/objects/task/task.css`. Collection layout, timeline bodies and update work grouping retain their feature owners.

AGENT object migration moves catalog, profile and identity framing styles into their shared object owners. Account notification styles and task styles retain their existing ownership.

## Cleanup

The baselines and this list MUST only shrink. Never add lint directives, baseline entries or higher counts for new code. ESLint debt is bound to the file, rule, token fingerprint and occurrence count; moving lines or formatting does not grant new allowances. Changed violating fragments and extra copies fail. Remove the corresponding entries/counts when migrating code to shared components; checks report stale entries. Update the table below in the same change. There is no baseline regeneration command.

Local checks reject baseline growth against HEAD. CI MUST set `ARC_UI_DEBT_BASE` to the PR base commit to reject growth across committed changes. The initial baseline is admitted only when that base has no baseline file.

Counts are outstanding violations per file and rule, sorted by count.

<!-- ui-debt:start -->
| File | Rule | Count |
| --- | --- | ---: |
| ui/product.css | shared-layout-css | 408 |
| ui/style.css | shared-layout-css | 93 |
| ui/components/TaskDetail.css | shared-layout-css | 72 |
| ui/components/AppUpdate.css | shared-layout-css | 37 |
| ui/subscriptions/bubble.css | shared-layout-css | 29 |
| ui/components/activity/activity.css | shared-layout-css | 5 |
<!-- ui-debt:end -->
