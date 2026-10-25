# Portrait homepage layout

The homepage has two geometry solvers sharing entities, account attribution, persisted order, collapse overrides, task queues and stable-ID animation. `solve.ts` owns the unchanged landscape geometry. `portrait.ts` owns portrait geometry; it never generates tentacles.

## Orientation

Display settings persist Layout: Auto / Landscape / Portrait, default Auto. Auto enters portrait at viewport width/height <= 0.85 and landscape at >= 1.0, retaining its current mode between thresholds (initially landscape). Evaluate 150ms after resizing stops; defer changes until pointer drags finish. Manual selection uses the same drag guard. `app.snapshot.model.topology` reports `orientation`, `source` (auto/manual), and pending orientation evaluation. `app_env.windowWidth` and `windowHeight` drive the viewport inputs.

Nodes and bubbles keep their IDs and spring to new slots in approximately 360ms. Reduced motion applies destinations directly and disables flow. Landscape geometry, earmuffs, tentacles and task bubbles retain their existing solver and renderer.

## Portrait geometry

At 900px width, the source rail is near x=170 and the Agent rail near x=768. The ring rotates clockwise 90 degrees: orange arc right, blue arc left, source dot above, Agent dot below. Entry-point glyphs remain upright. Thick horizontal earmuffs are approximately 144px long at y=hub +/-112, with the landscape stroke weight. Their outer ends join thin translucent rails with rounded 26px corners, forming a point-symmetric Z.

Source platforms follow persisted order down the left rail. Their labels sit outside, right-aligned. Tree accounts fork inward to the right through a short stub and vertical bus, with 48px account rows and labels on the right. Each platform reserves its descendants' height.

Agent platforms descend the right rail. Their names and optional auto-compaction chips sit outside. Tree accounts expand left through a vertical bus into one account column, with labels below nodes. Each account has its own task bus farther left; horizontal final stubs terminate at bubble right edges. Inner routing uses rounded 10px corners. Single-account platforms skip the account level. Flat mode retains existing account semantics. Multi-account platform quota rings remain absent; account nodes carry their own rings.

Active rows fit task stacks with existing density and 10px default gaps. Idle platforms use existing idle scale/opacity at the rail bottom, retaining persisted order within active and idle groups without rewriting preferences. Queue selection, five slots, aggregate slots, pending-first ordering and temporary expansion remain upstream responsibilities. Bubble width fills available space from a 16px left margin to the task buses, capped at 480px and normally floored at the narrow preference. At viewports too narrow for that floor plus hierarchy, available width wins to prevent horizontal scrolling. The scene scrolls vertically and reserves bottom dock clearance.

Only final task stubs carry status: accent/flow for running, green for completed, amber for input and border-strong for aggregates. External stubs are dashed. Buses remain neutral Agent color. All colors use theme tokens.

## Panels

Agent/account panels dock inside the right rail over the bubbles, from a 16px left margin to 40px before the selected node's stubs. Their vertical range starts below the lower earmuff and ends above the dock. A selected-node stub reaches the panel's right edge; bubbles and their stubs fade using existing panel state.

Source panels occupy a full-width inset gap below the source block and above the hub. Content determines height up to a viewport limit; the reserved gap shifts the hub and Agent section down without shifting source order. The selected source connects to the panel's top edge.

Both modes reuse the existing nonmodal shell, open/close timing, outside-click, Escape and focus restoration. Header controls and the bottom-left dock retain their positions.
