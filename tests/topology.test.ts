import { arcPath, grownWire } from "../ui/topology/geometry.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, PARAMETERS, PARAMETER_GROUPS, distribute, extentOf, solve, LABEL_W, NODE_R, type Scene } from "../ui/topology/solve.ts";
import { clampParameter, emptyParameters, importParameters, loadParameters, parameterDiff } from "../ui/topology/parameters.ts";

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
      if (wing.side === -1) { assert.equal(node.scale, node.active ? DEFAULTS.activeScale : 1); assert.equal(node.opacity, 1); }
      const tasks = wing.tasks.filter(t => t.parent === node.id);
      for (let i = 1; i < tasks.length; i++) {
        assert.equal(tasks[i].y - tasks[i - 1].y, DEFAULTS.pitch);
        assert.ok(tasks[i].port - tasks[i - 1].port >= 9 - 1e-9);
      }
    }
  }
  // Bounds now include only the earmuff, nodes and tasks, with no column-tail entrance.
  for (const wing of layout.wings) {
    assert.equal(extentOf(wing, layout.hub.x, layout.hub.Re).core, Math.max(layout.hub.Re * 1.15,
      ...wing.nodes.map(n => Math.abs(n.x - layout.hub.x) + LABEL_W * n.scale * n.size / (NODE_R * 2) / 2)));
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
  const dragged = solve(sc, DEFAULTS, { kind: "task", side: -1, id: "source0/task0", x: base.wings[0].tasks[0].x, y: 123 });
  assert.equal(dragged.wings[0].tasks[0].y, 123);
  assert.deepEqual(dragged.wings[1], base.wings[1]);
  assert.equal(solve(sc, DEFAULTS, { kind: "node", side: 1, id: "agent0", x: base.wings[1].nodes[0].x, y: 234 }).wings[1].nodes[0].y, 234);
});


test("topology parameters persist only deviations and round-trip through JSON", () => {
  assert.equal(new Set(PARAMETERS.map(p => p.key)).size, PARAMETERS.length);
  for (const spec of PARAMETERS) {
    assert.ok(spec.default >= spec.min && spec.default <= spec.max);
    assert.ok(spec.step > 0);
    assert.ok(PARAMETER_GROUPS[spec.group].en && spec.label.en && spec.label["zh-CN"]);
    assert.equal(DEFAULTS[spec.key], spec.default);
  }
  assert.deepEqual(parameterDiff(DEFAULTS), emptyParameters());
  const custom = { ...DEFAULTS, margin: 62, damping: 35 };
  const saved = parameterDiff(custom);
  assert.deepEqual(saved, { schemaVersion: 1, overrides: { margin: 62, damping: 35 } });
  const imported = importParameters(JSON.stringify(saved));
  assert.ok(imported.ok);
  assert.deepEqual(imported.clamped, []);
  assert.deepEqual(loadParameters(imported.document), custom);
  assert.deepEqual(parameterDiff(loadParameters(emptyParameters())), emptyParameters());
});

test("topology parameter ranges clamp at input, save and load boundaries", () => {
  for (const spec of PARAMETERS) {
    assert.equal(clampParameter(spec.key, spec.min - 1), spec.min);
    assert.equal(clampParameter(spec.key, spec.max + 1), spec.max);
    for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(clampParameter(spec.key, invalid), spec.default);
  }
  const saved = parameterDiff({ ...DEFAULTS, margin: -200, damping: 999, flare: NaN });
  assert.deepEqual(saved.overrides, { margin: 16, damping: 60 });
  assert.equal(loadParameters({ schemaVersion: 1, overrides: { margin: 999 } }).margin, 120);
  // Preserve in-range values even when they fall between slider steps.
  assert.equal(clampParameter("colDist", 2.13), 2.13);
});

test("topology imports validate the complete document before applying any values", () => {
  for (const [json, error] of [
    ["{", "json"], ["null", "schema"], ["[]", "schema"], ["{}", "schema"],
    ['{"schemaVersion":2,"overrides":{}}', "schema"],
    ['{"schemaVersion":1,"overrides":[]}', "schema"],
    ['{"schemaVersion":1,"overrides":{},"extra":true}', "schema"],
    ['{"schemaVersion":1,"overrides":{"unknown":4}}', "key"],
    ['{"schemaVersion":1,"overrides":{"__proto__":4}}', "key"],
    ['{"schemaVersion":1,"overrides":{"margin":"80"}}', "value"],
    ['{"schemaVersion":1,"overrides":{"margin":null}}', "value"],
    ['{"schemaVersion":1,"overrides":{"margin":true}}', "value"],
    ['{"schemaVersion":1,"overrides":{"margin":1e999}}', "value"],
  ]) assert.deepEqual(importParameters(json), { ok: false, error });
  const defaults = Object.freeze({ ...DEFAULTS });
  assert.equal(importParameters('{"schemaVersion":1,"overrides":{"margin":80,"flare":"bad"}}', defaults).ok, false);
  assert.deepEqual(defaults, DEFAULTS);
  const imported = importParameters('{"schemaVersion":1,"overrides":{"margin":999,"earFollow":-1,"colDist":2.6}}');
  assert.ok(imported.ok);
  assert.deepEqual(imported.clamped, ["margin", "earFollow"]);
  assert.deepEqual(imported.document, { schemaVersion: 1, overrides: { margin: 120, earFollow: 0 } });
});

test("upgraded defaults apply to untouched parameters while manual overrides remain", () => {
  const saved = parameterDiff({ ...DEFAULTS, damping: 38 });
  const upgraded = { ...DEFAULTS, margin: 54, damping: 30, bubbleWeight: 0.9 };
  const loaded = loadParameters(saved, upgraded);
  assert.equal(loaded.margin, 54);
  assert.equal(loaded.bubbleWeight, 0.9);
  assert.equal(loaded.damping, 38);
  assert.deepEqual(loadParameters(emptyParameters(), upgraded), upgraded);
  const imported = importParameters(JSON.stringify(saved), upgraded);
  assert.ok(imported.ok);
  assert.deepEqual(loadParameters(imported.document, upgraded), loaded);
  assert.deepEqual(parameterDiff({ ...loaded, damping: upgraded.damping }, upgraded), emptyParameters());
});

test("path generation skips non-finite coordinates and recovers on the next frame", () => {
  const points = [{ x: 484, y: 348 }, { x: 447.5, y: 348 }, { x: 581.82, y: 348 }, { x: 557, y: 348 }];
  const empty = { outline: "", centerline: "", gap: "" };
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (let i = 0; i < 4; i++) for (const axis of ["x", "y"]) {
      const frame = points.map((p, j) => j === i ? { ...p, [axis]: invalid } : p);
      assert.deepEqual(grownWire(frame[0], frame[1], frame[2], frame[3], 1, 1, true), empty);
    }
    for (let i = 0; i < 5; i++) {
      const args = [450, 340, 130, -30, 30]; args[i] = invalid;
      assert.equal(arcPath(args[0], args[1], args[2], args[3], args[4], 1), "");
    }
    assert.deepEqual(grownWire(points[0], points[1], points[2], points[3], invalid, 1), empty);
  }
  const shape = grownWire(points[0], points[1], points[2], points[3], 1, 1, true);
  assert.equal(shape.centerline, "M 484 348 C 447.5 348 581.82 348 557 348");
  assert.ok(shape.outline && !/NaN|Infinity/.test(shape.outline));
});
