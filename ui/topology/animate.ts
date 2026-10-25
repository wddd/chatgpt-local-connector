import { DEFAULTS, type Drag, type Layout, type Side } from "./solve.ts";

export const nodeKey = (side: Side, id: string) => JSON.stringify(["node", side, id]);
export const taskKey = (side: Side, id: string) => JSON.stringify(["task", side, id]);
type Field = { x: number; v: number; t: number; pin?: number };
export interface Primitive {
  fields: Record<string, Field>;
  alive: boolean;
  parent?: string;
  side?: Side;
}
// Each mounted scene owns its springs and clock. Geometry is never sampled from DOM.
export class TopologyAnimator {
  readonly live = new Map<string, Primitive>();
  params: typeof DEFAULTS;
  constructor(params = DEFAULTS) { this.params = params; }
  private spring(key: string, targets: Record<string, number>, spawn: Record<string, number> = {}) {
    let s = this.live.get(key);
    if (!s) { s = { fields: {}, alive: true }; this.live.set(key, s); }
    s.alive = true;
    for (const [name, target] of Object.entries(targets)) {
      const f = s.fields[name] ??= { x: spawn[name] ?? target, v: 0, t: target };
      f.t = target; f.pin = undefined;
    }
    return s;
  }
  setTargets(layout: Layout, drag: Drag | null = null) {
    this.live.forEach(s => { s.alive = false; });
    this.spring("hub", { ...layout.hub });
    this.spring("scene", { height: layout.sceneH });
    const { t1Node, t1Root, t2End, t2Root, flare } = this.params;
    this.spring("shape", { t1Node, t1Root, t2End, t2Root, flare });
    for (const w of layout.wings) {
      this.spring(`ear${w.side}`, w.ear);
      for (const n of w.nodes) {
        const parent = n.parent ? this.values(nodeKey(w.side, n.parent)) : undefined;
        const s = this.spring(nodeKey(w.side, n.id), { x: n.x, y: n.y, size: n.size, scale: n.scale, op: n.opacity, port: n.port,
          radius: n.arc?.R ?? n.size / 2 * n.scale + this.params.arcGap, alo: n.arc?.lo ?? 0, ahi: n.arc?.hi ?? 0, aop: n.arc ? 1 : 0, presence: n.opacity === 0 ? 0 : 1, light: 1, wireLight: 1 },
        { aop: 0, alo: 0, ahi: 0, ...(parent ? { x: parent.x + w.side * parent.radius, y: parent.y, op: 0, presence: 0, scale: 0.6 } : {}) });
        s.side = w.side; s.parent = n.parent ? nodeKey(w.side, n.parent) : undefined;
        if (drag?.kind === "node" && drag.side === w.side && drag.id === n.id) {
          s.fields.x.pin = drag.x; s.fields.y.pin = drag.y;
        }
      }
      for (const t of w.tasks) {
        const parent = nodeKey(w.side, t.parent), n = this.values(parent)!;
        const s = this.spring(taskKey(w.side, t.id), { x: t.x, y: t.y, width: t.width, height: t.height, port: t.port, op: t.hidden ? 0 : 1, light: 1, wireLight: 1, offset: 0 },
          { x: n.x + t.side * n.radius, y: n.y, port: 0, op: 0 });
        s.parent = parent; s.side = w.side;
        if (drag?.kind === "task" && drag.side === w.side && drag.id === t.id) {
          s.fields.x.pin = drag.x; s.fields.y.pin = drag.y;
        }
      }
    }
    for (const [key, s] of this.live) {
      if (s.alive) continue;
      if (!s.parent) { this.live.delete(key); continue; }
      s.fields.op.t = 0; s.fields.port.t = 0;
      if (s.fields.presence) s.fields.presence.t = 0;
      s.fields.x.pin = s.fields.y.pin = undefined;
    }
  }
  highlight(nodes: Set<string> | null) {
    for (const [key, primitive] of this.live) {
      if (!primitive.alive || !primitive.fields.light) continue;
      const [kind, side, id] = JSON.parse(key) as [string, Side, string];
      const lit = !nodes || nodes.has(kind === 'task' ? key : JSON.stringify([side, id]));
      primitive.fields.light.t = lit ? 1 : kind === 'task' ? 0.35 : 0.32;
      primitive.fields.wireLight.t = lit ? 1 : 0.18;
      if (primitive.fields.offset) primitive.fields.offset.t = nodes && lit ? 6 * side : 0;
    }
  }
  values(key: string) {
    const s = this.live.get(key);
    return s ? Object.fromEntries(Object.entries(s.fields).map(([key, f]) => [key, f.x])) : undefined;
  }
  step(dt: number, reduced = false) {
    let moving = false;
    const { stiffness: k, damping: c } = this.params;
    for (const [key, s] of this.live) {
      if (!s.alive && s.parent) {
        const n = this.values(s.parent);
        if (n) { s.fields.x.t = n.x + s.side! * n.radius; s.fields.y.t = n.y; }
      }
      for (const f of Object.values(s.fields)) {
        if (f.pin !== undefined || reduced) { f.x = f.pin ?? f.t; f.v = 0; continue; }
        const sub = Math.max(1, Math.ceil(dt / 0.008)), h = dt / sub;
        for (let i = 0; i < sub; i++) { f.v += (-k * (f.x - f.t) - c * f.v) * h; f.x += f.v * h; }
        if (Math.abs(f.x - f.t) > 0.01 || Math.abs(f.v) > 0.01) moving = true;
        else { f.x = f.t; f.v = 0; }
      }
      if (!s.alive && s.fields.op.x < 0.02) this.live.delete(key);
    }
    return moving;
  }
}
