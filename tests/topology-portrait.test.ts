import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePortrait } from '../ui/topology/portrait.ts';
import { solve, type Entity } from '../ui/topology/solve.ts';
import { TopologyAnimator, nodeKey, taskKey } from '../ui/topology/animate.ts';

const tasks = (id: string, count: number) => Array.from({ length: count }, (_, i) => ({ id: `${id}/${i}`, width: 264, height: 54 + i * 10 }));
const left: Entity[] = [{ id: 'source', tasks: [], children: [{ id: 'source/a', tasks: [] }, { id: 'source/b', tasks: [] }] }];
const right: Entity[] = [{ id: 'idle/a', tasks: [] }, { id: 'agent', tasks: [], children: [
  { id: 'account/a', tasks: tasks('a', 5) }, { id: 'account/b', tasks: tasks('b', 2) },
] }, { id: 'single', tasks: tasks('single', 1) }, { id: 'idle/b', tasks: [] }];

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
