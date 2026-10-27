import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePortrait, portraitPanelRect, portraitPanelRoute, type PortraitLabels } from '../ui/topology/portrait.ts';
import { DEFAULTS, NODE_R, solve, type Entity } from '../ui/topology/solve.ts';
import { TopologyAnimator, nodeKey, taskKey } from '../ui/topology/animate.ts';
import { bubbleWidths } from '../ui/state/activityModel.ts';

const tasks = (id: string, count: number) => Array.from({ length: count }, (_, i) => ({ id: `${id}/${i}`, width: 264, height: 54 + i * 10 }));
const left: Entity[] = [{ id: 'source', tasks: [], children: [{ id: 'source/a', tasks: [] }, { id: 'source/b', tasks: [] }] }];
const right: Entity[] = [{ id: 'idle/a', tasks: [] }, { id: 'agent', tasks: [], children: [
  { id: 'account/a', tasks: tasks('a', 5) }, { id: 'account/b', tasks: tasks('b', 2) },
] }, { id: 'single', tasks: tasks('single', 1) }, { id: 'idle/b', tasks: [] }];
const measured = (width: number) => ({ width, twoLineWidth: Math.ceil(width * 0.6), height: 14 });
const labels: PortraitLabels = {
  left: new Map([['source', measured(74)], ['source/a', measured(84)], ['source/b', measured(110)]]),
  right: new Map([['agent', measured(108)], ['single', measured(150)], ['idle/a', measured(140)], ['idle/b', measured(100)],
    ['account/a', measured(90)], ['account/b', measured(170)]]),
};

test('portrait rail insets contain measured platform and account labels at every supported width', () => {
  // Regression: portrait platform labels clipped at 900 and 1080, and account/platform labels escaped the 420 viewport.
  for (const vw of [320, 420, 600, 900, 1080]) {
    const scene = { vw, vh: 1600, left, right };
    const layout = solvePortrait(scene, DEFAULTS, null, labels), p = layout.portrait!;
    for (const wing of layout.wings) for (const node of wing.nodes) {
      const metric = labels[node.side === -1 ? 'left' : 'right'].get(node.id)!;
      const scale = node.size * node.scale / (NODE_R * 2), offset = (NODE_R + 12) * scale;
      const budget = node.side === -1 ? node.parent ? p.sourceAccountLabelWidth : p.sourceLabelWidth
        : node.parent ? p.agentAccountLabelWidth : p.agentLabelWidth;
      assert.ok(budget >= metric.twoLineWidth * scale);
      const width = Math.min(metric.width * scale, budget);
      const x = node.parent ? node.x - width / 2
        : node.side === -1 && !node.parent ? node.x - offset - width : node.x + offset;
      assert.ok(x > 0 && x + width < vw);
    }
    const bubbles = layout.wings[1].tasks;
    assert.ok(bubbles.every(t => t.x - t.width > 0 && t.x < vw));
    const longest = layout.wings[1].nodes.find(n => n.id === 'single')!;
    const fullWidth = labels.right.get(longest.id)!.width * longest.scale;
    const singleLineBubbleWidth = bubbles[0].width - (fullWidth - p.agentLabelWidth);
    if (singleLineBubbleWidth >= bubbleWidths.narrow) assert.ok(p.agentLabelWidth >= fullWidth);
    else assert.ok(p.agentLabelWidth < fullWidth);
  }
});

test('wider measured labels move the rail and its complete inward hierarchy together', () => {
  // Property: outer-label growth consumes bubble space without changing hierarchy offsets or source order.
  const scene = { vw: 600, vh: 1100, left, right };
  const before = solvePortrait(scene, DEFAULTS, null, labels);
  const wider: PortraitLabels = { left: new Map(labels.left).set('source', measured(110)), right: new Map(labels.right).set('single', measured(180)) };
  const after = solvePortrait(scene, DEFAULTS, null, wider);
  assert.ok(after.portrait!.sourceX > before.portrait!.sourceX);
  const shift = after.portrait!.agentX - before.portrait!.agentX;
  assert.ok(shift < 0);
  for (const [i, node] of after.wings[1].nodes.entries()) {
    const old = before.wings[1].nodes[i];
    assert.ok(Math.abs(node.x - old.x - shift) < 1e-6);
    assert.ok(Math.abs(node.childBusX! - old.childBusX! - shift) < 1e-6);
    assert.ok(Math.abs(node.taskBusX! - old.taskBusX! - shift) < 1e-6);
  }
  for (const [i, task] of after.wings[1].tasks.entries()) {
    assert.ok(task.width < before.wings[1].tasks[i].width);
    assert.ok(Math.abs(task.x - before.wings[1].tasks[i].x - shift) < 1e-6);
  }
});

test('portrait places every task within its own row and the horizontal viewport', () => {
  // Property: inward hierarchy preserves identity, input order and nonoverlapping task stacks without horizontal overflow.
  for (const vw of [320, 600, 900, 1400]) {
    const scene = { vw, vh: 1000, left, right }, before = JSON.stringify(scene);
    const layout = solvePortrait(scene), [sources, agents] = layout.wings;
    assert.equal(JSON.stringify(scene), before);
    assert.ok(layout.sceneH >= scene.vh);
    assert.ok(sources.nodes.every(n => n.y < layout.hub.y));
    assert.ok(agents.nodes.every(n => n.y > layout.hub.y));
    const roots = agents.nodes.filter(n => !n.parent);
    assert.deepEqual(roots.map(n => n.id), ['agent', 'single', 'idle/a', 'idle/b']);
    assert.ok(roots.filter(n => n.dim).every(n => n.scale < roots[0].scale));
    for (const node of [...sources.nodes, ...agents.nodes]) {
      if (node.parent) {
        const parent = [...sources.nodes, ...agents.nodes].find(n => n.id === node.parent)!;
        assert.ok(node.side * (node.x - parent.x) < 0);
      }
    }
    const bubbles = agents.tasks.toSorted((a, b) => a.y - b.y);
    for (const [i, bubble] of bubbles.entries()) {
      assert.ok(bubble.x - bubble.width >= 0 && bubble.x < vw);
      const node = agents.nodes.find(n => n.id === bubble.parent)!;
      assert.ok(bubble.x < node.taskBusX! && node.taskBusX! < node.x);
      if (i) assert.ok(bubble.y - bubble.height / 2 > bubbles[i - 1].y + bubbles[i - 1].height / 2);
      assert.ok(bubble.y + bubble.height / 2 < layout.sceneH);
    }
  }
});
test('orientation changes reuse live node and task primitives', () => {
  // Property: changing solvers preserves every surviving stable ID and reduced motion reaches its destination directly.
  const scene = { vw: 900, vh: 1200, left, right }, animator = new TopologyAnimator();
  animator.setTargets(solve(scene)); animator.step(0, true);
  const node = animator.live.get(nodeKey(1, 'account/a')), task = animator.live.get(taskKey(1, 'a/0'));
  const portrait = solvePortrait(scene);
  animator.setTargets(portrait); animator.step(0, true);
  assert.equal(animator.live.get(nodeKey(1, 'account/a')), node);
  assert.equal(animator.live.get(taskKey(1, 'a/0')), task);
  for (const wing of portrait.wings) {
    for (const n of wing.nodes) assert.equal(animator.values(nodeKey(wing.side, n.id))!.y, n.y);
    for (const t of wing.tasks) assert.equal(animator.values(taskKey(wing.side, t.id))!.x, t.x);
  }
});
test('collapsed subtrees and flat nodes retain their existing queue semantics', () => {
  // Property: the portrait solver neither expands collapsed descendants nor invents account levels for flat inputs.
  const collapsed = solvePortrait({ vw: 900, vh: 1200, left, right: [{ ...right[1], collapsed: true }] });
  assert.deepEqual(collapsed.wings[1].nodes.map(n => n.id), ['agent']);
  assert.equal(collapsed.wings[1].tasks.length, 0);
  const flat = solvePortrait({ vw: 900, vh: 1200, left: [], right: right[1].children! });
  assert.ok(flat.wings[1].nodes.every(n => n.parent === undefined));
  assert.deepEqual(flat.wings[1].tasks.map(t => t.id), right[1].children!.flatMap(n => n.tasks.map(t => t.id)));
});

test('portrait panels mirror viewport edges without moving the topology', () => {
  // Regression: AGENT L1 and L2 panels docked left at a 640px viewport.
  for (const vw of [320, 640, 900, 1080]) {
    const scene = { vw, vh: 1200, left, right };
    const closed = solvePortrait(scene, DEFAULTS, null, labels);
    const sourceRect = portraitPanelRect(closed, { side: -1 });
    const agentRect = portraitPanelRect(closed, { side: 1 });
    assert.equal(sourceRect.x, vw - agentRect.x - agentRect.width);
    assert.equal(sourceRect.width, agentRect.width);
    assert.equal(sourceRect.y, agentRect.y);
    assert.equal(sourceRect.height, agentRect.height);
    assert.ok(sourceRect.x <= agentRect.x);
    for (const wing of closed.wings) for (const selected of wing.nodes) {
      const open = solvePortrait({ ...scene, panel: { side: wing.side, selected: selected.id, edge: 0 } }, DEFAULTS, null, labels);
      assert.deepEqual(open.hub, closed.hub);
      for (const [i, current] of open.wings.entries()) {
        assert.deepEqual(current.nodes.map(n => [n.id, n.x, n.y]), closed.wings[i].nodes.map(n => [n.id, n.x, n.y]));
      }
      const rect = portraitPanelRect(open, selected);
      assert.deepEqual(rect, wing.side === -1 ? sourceRect : agentRect);
      assert.ok(rect.x >= 0 && rect.x + rect.width <= vw && rect.width > 0);
      assert.ok(rect.y >= 0 && rect.y + rect.height <= scene.vh);
    }
  }
});

test('portrait panel connectors reach the inward edge only from uncovered nodes', () => {
  // Property: mirrored connector routes are orthogonal and never reverse through an overlaid node.
  const scene = solvePortrait({ vw: 900, vh: 1200, left, right });
  for (const side of [-1, 1] as const) {
    const panel = portraitPanelRect(scene, { side });
    const edge = side === 1 ? panel.x : panel.x + panel.width;
    for (const y of [panel.y / 2, panel.y + panel.height / 2, panel.y + panel.height * 2]) {
      const node = { side, x: edge - side * 100, y, size: 44, scale: 1 };
      const route = portraitPanelRoute(node, panel);
      assert.equal(route.at(-1)!.x, edge);
      assert.ok(route.at(-1)!.y > panel.y && route.at(-1)!.y < panel.y + panel.height);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        assert.ok(a.x === b.x || a.y === b.y);
        assert.ok((b.x - a.x) * side >= 0);
      }
      assert.deepEqual(portraitPanelRoute({ ...node, x: panel.x + panel.width / 2 }, panel), []);
    }
  }
});
test('portrait Agent panels fade tasks without changing queues', () => {
  // Property: panel selection preserves task identities and node order while hiding the queue behind the overlay.
  const scene = { vw: 900, vh: 1200, left, right };
  const closed = solvePortrait(scene);
  for (const id of ['agent', 'account/a', 'single']) {
    const open = solvePortrait({ ...scene, panel: { side: 1, selected: id, edge: 0 } });
    assert.deepEqual(open.wings[1].nodes.map(n => [n.id, n.x, n.y]), closed.wings[1].nodes.map(n => [n.id, n.x, n.y]));
    assert.deepEqual(open.wings[1].tasks.map(t => t.id), closed.wings[1].tasks.map(t => t.id));
    assert.ok(open.wings[1].tasks.every(t => t.hidden));
  }
});
test('orientation springs settle within a bounded transition and can reverse', () => {
  // Property: reversing orientation retains primitives and converges to the latest solver without nonfinite coordinates.
  const scene = { vw: 900, vh: 1200, left, right }, animator = new TopologyAnimator();
  const landscape = solve(scene), portrait = solvePortrait(scene);
  animator.setTargets(landscape); animator.step(0, true);
  const task = animator.live.get(taskKey(1, 'a/0'));
  animator.setTargets(portrait);
  for (let frame = 0; frame < 8; frame++) animator.step(1 / 60);
  animator.setTargets(landscape);
  for (let frame = 0; frame < 24; frame++) animator.step(1 / 60);
  assert.equal(animator.live.get(taskKey(1, 'a/0')), task);
  for (const wing of landscape.wings) for (const n of wing.nodes) {
    const actual = animator.values(nodeKey(wing.side, n.id))!;
    assert.equal(actual.x, n.x); assert.equal(actual.y, n.y);
    assert.ok(Object.values(actual).every(Number.isFinite));
  }
  assert.equal(animator.step(1 / 60), false);
});
