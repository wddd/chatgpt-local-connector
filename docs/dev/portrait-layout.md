# Portrait homepage layout

The homepage has two geometry solvers sharing entities, account attribution, persisted order, collapse overrides, task queues and stable-ID animation. `solve.ts` owns landscape geometry. `portrait.ts` owns portrait geometry; it never generates tentacles.

## Orientation

Display settings persist Layout: Auto / Landscape / Portrait, default Auto. Auto enters portrait at viewport width/height <= 0.85 and landscape at >= 1.0, retaining its current mode between thresholds (initially landscape). Evaluate 150ms after resizing stops; defer changes until pointer drags finish. Manual selection uses the same drag guard. `app.snapshot.model.topology` reports `orientation`, `source` (auto/manual), and pending orientation evaluation. `app_env.windowWidth` and `windowHeight` drive the viewport inputs.

Nodes and bubbles keep their IDs and spring to new slots in approximately 360ms. Reduced motion applies destinations directly and disables flow. Landscape geometry, earmuffs, tentacles and task bubbles retain their existing solver and renderer.

## Portrait geometry

Rail positions follow measured labels, including node scale and optional auto-compaction chips. The source rail sits to the right of the widest outer source label with a 16px left margin. The Agent rail sits to the left of the widest outer Agent label with a 16px right margin; its account column, task buses and bubble column move together. The ring rotates clockwise 90 degrees: orange arc right, blue arc left, source dot above, Agent dot below. Entry-point glyphs remain upright. At the maximum default hub radius, thick horizontal earmuffs are approximately 144px long at y=hub +/-112, with the landscape stroke weight. Their length, offset and stroke weight scale with the hub radius. Their outer ends join thin translucent rails with rounded 26px corners, forming a Z.

The hub radius also fits 8% of the viewport height, with a 56px minimum before applying the ring-size preference. The gaps above and below the hub shrink with its radius. Node logos have opaque canvas backgrounds so rails cannot show through them.

Source platforms follow persisted order down the left rail. Their labels sit outside, right-aligned. Tree accounts fork inward to the right through rounded routes, with 42px nodes, at least 24px of vertical clearance between account icons, and centered labels below icons, matching Agent account nodes. Account rows reserve the complete label height. Shared stems are painted once without a separate overlapping vertical bus. Each platform reserves its descendants' height.

Agent platforms descend the right rail. Their names and optional auto-compaction chips sit outside. Tree accounts expand left through the same rounded fork routes into one account column, with labels below nodes. Each account has its own task bus farther left; horizontal final stubs terminate at bubble right edges. Inner routing uses rounded 10px corners. Single-account platforms skip the account level. Flat mode retains existing account semantics. Multi-account platform quota rings remain absent; account nodes carry their own rings.

Active rows fit task stacks with existing density and 10px default gaps. Idle platforms use existing idle scale/opacity at the rail bottom, retaining persisted order within active and idle groups without rewriting preferences. Queue selection, five slots, aggregate slots, pending-first ordering and temporary expansion remain upstream responsibilities. Bubble width fills available space from a 16px left margin to the task buses, capped at 480px and normally floored at the narrow preference. At viewports too narrow for that floor plus hierarchy, available width wins to prevent horizontal scrolling. The scene scrolls vertically and reserves bottom dock clearance.

Labels remain complete within the viewport. Keep outer Agent labels on one line while the minimum bubble width and hierarchy fit; otherwise permit two lines using measured wrapping widths before shrinking bubbles below their narrow preference. Source labels wrap only when their full source/account row cannot fit. Account labels use their available inward space, and rows reserve their label height. Never ellipsize portrait labels or chips.

Task branches form complete rounded routes from the node through the bus column. Shared stems are painted once without a straight bus cutting across their bends. Each neutral branch ends horizontally at the exact start of its status stub. Only final task stubs carry status: accent/flow for running, green for completed, amber for input and border-strong for aggregates. External stubs are dashed. Buses remain neutral Agent color. All colors use theme tokens.

## Panels

SRC panels dock at the left viewport edge and AGENT/account/task panels dock at the right viewport edge at every width. Portrait panels mirror each other with a 16px outer margin, the shared panel width capped by the viewport, and clearance above the bottom dock.

Panels overlay the scene without reserving a vertical gap, moving nodes or scrolling the topology on open. The shared panel scroll area contains long content. A connector reaches the panel's inward edge only when the selected node is outside the panel on that side; covered nodes do not draw a connector through the overlay. Bubbles and their stubs fade using existing panel state.

Portrait panels omit the landscape width-expansion control. An explicit `app_env.taskPanelWidth` may narrow the Agent panel while preserving its right edge.

Both modes reuse the existing nonmodal shell, open/close timing, outside-click, Escape and focus restoration. Header controls and the bottom-left dock retain their positions.
