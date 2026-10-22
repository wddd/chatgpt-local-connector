import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, distribute, extentOf, solve, type Scene } from "../ui/topology/solve.ts";

const entities = (prefix: string, counts: number[]) => counts.map((count, i) => ({ id: `${prefix}${i}`,
  tasks: Array.from({ length: count }, (_, j) => ({ id: `${prefix}${i}/task${j}` })) }));
// Representative populations for the five lab viewport scenarios. The reference
// solver supplies no serialized scene populations; ids here are synthetic.
const fixtures: Record<string, Scene> = {
  current: { vw: 1000, vh: 640, left: entities("source", [0, 0]), right: entities("agent", [1, 0, 0, 0]) },
  multi: { vw: 1280, vh: 800, left: entities("source", [0, 0]), right: entities("agent", [3, 2, 0, 0]) },
  busy: { vw: 1180, vh: 640, left: entities("source", [0, 0]), right: entities("agent", [5, 4, 3, 0]) },
  bilateral: { vw: 1440, vh: 820, left: entities("source", [2, 3]), right: entities("agent", [3, 2, 0]) },
  narrow: { vw: 900, vh: 680, left: entities("source", [0, 0]), right: entities("agent", [3, 1, 0, 0]) },
};
for (const [name, scene] of Object.entries(fixtures)) test(`topology lab: ${name}`, () => {
  const frozen = JSON.stringify(scene), layout = solve(scene), [left, right] = layout.wings;
  assert.equal(JSON.stringify(scene), frozen);
  assert.equal(layout.sceneH, Math.max(scene.vh, left.H + 140, right.H + 140));
  assert.equal(layout.hub.y, layout.sceneH / 2);
  for (const wing of layout.wings) {
    assert.equal(wing.nodes.length, (wing.side === -1 ? scene.left : scene.right).length);
    for (let i = 1; i < wing.nodes.length; i++) assert.ok(wing.nodes[i].port - wing.nodes[i - 1].port >= DEFAULTS.earSep - 1e-9);
    for (const node of wing.nodes) {
      if (wing.side === -1) { assert.equal(node.scale, 1); assert.equal(node.opacity, 1); }
      const tasks = wing.tasks.filter(t => t.parent === node.id);
      for (let i = 1; i < tasks.length; i++) {
        assert.equal(tasks[i].y - tasks[i - 1].y, DEFAULTS.pitch);
        assert.ok(tasks[i].port - tasks[i - 1].port >= 9 - 1e-9);
      }
    }
  }
  const l = extentOf(left, layout.hub.x, layout.hub.Re), r = extentOf(right, layout.hub.x, layout.hub.Re);
  assert.ok(layout.hub.x - l.full >= DEFAULTS.margin - 1e-9);
  if (l.full + r.full <= scene.vw - 2 * DEFAULTS.margin) assert.ok(layout.hub.x + r.full <= scene.vw - DEFAULTS.margin + 1e-9);
});
test("right activity moves the hub left without compressing or dimming sources", () => {
  const empty = { ...fixtures.multi, right: entities("agent", [0, 0, 0, 0]) };
  const idle = solve(empty), busy = solve(fixtures.multi), overflow = solve({ ...fixtures.multi, right: fixtures.busy.right });
  assert.ok(busy.hub.x < idle.hub.x);
  assert.equal(overflow.wings[0].H, idle.wings[0].H);
  assert.deepEqual(overflow.wings[0].nodes.map(n => [n.y - overflow.hub.y, n.scale, n.opacity]),
    idle.wings[0].nodes.map(n => [n.y - idle.hub.y, n.scale, n.opacity]));
  assert.ok(solve(fixtures.busy).sceneH > fixtures.busy.vh);
});
test("column compression exhausts the left column before the right; overflow clips on the right", () => {
  for (let vw = 1400; vw >= 700; vw -= 10) {
    const layout = solve({ ...fixtures.multi, vw }), { hub } = layout;
    const ratio = (side: number) => Math.abs(layout.wings[side].nodes[0].x - hub.x) / (hub.Re * DEFAULTS.colDist);
    assert.ok(ratio(0) >= DEFAULTS.squeezeMin - 1e-9);
    assert.ok(ratio(1) >= DEFAULTS.squeezeMin - 1e-9);
    if (ratio(1) < 1 - 1e-9) assert.ok(Math.abs(ratio(0) - DEFAULTS.squeezeMin) < 1e-9);
  }
  const narrow = solve({ ...fixtures.bilateral, vw: 700 });
  assert.ok(narrow.hub.x + extentOf(narrow.wings[1], narrow.hub.x, narrow.hub.Re).full > 700 - DEFAULTS.margin);
});
test("ports fit the arc and drag is confined to its wing and item", () => {
  assert.deepEqual(distribute([0, 0, 0], 0.7, 7, 42), [0, 7, 14]);
  const crowded = distribute(Array(30).fill(80), 0.7, 7, 42);
  assert.equal(crowded[0], -42); assert.ok(crowded.at(-1)! <= 42 + 1e-9);
  const sc = fixtures.bilateral, base = solve(sc);
  const dragged = solve(sc, DEFAULTS, { kind: "task", side: -1, id: "source0/task0", y: 123 });
  assert.equal(dragged.wings[0].tasks[0].y, 123);
  assert.deepEqual(dragged.wings[1], base.wings[1]);
  assert.equal(solve(sc, DEFAULTS, { kind: "node", side: 1, id: "agent0", y: 234 }).wings[1].nodes[0].y, 234);
});
