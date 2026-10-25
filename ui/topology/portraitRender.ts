import type { Point, Side } from './solve';
import { TopologyAnimator, nodeKey, taskKey } from './animate';
import type { PaintNode, PaintTask } from './render';
import type { SurfaceRect } from '../motion/surface';

// Rounded orthogonal polyline. Corners clamp to their adjacent segments, so
// short stubs and temporarily coincident animated points remain finite.
export function railPath(points: Point[], radius = 10): string {
  const run = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (!run.length || run.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return '';
  let path = `M${run[0].x},${run[0].y}`;
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1], b = run[i], c = run[i + 1];
    if (!c) { path += ` L${b.x},${b.y}`; break; }
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, before / 2, after / 2);
    path += ` L${b.x + (a.x - b.x) * r / before},${b.y + (a.y - b.y) * r / before}`;
    path += ` Q${b.x},${b.y} ${b.x + (c.x - b.x) * r / after},${b.y + (c.y - b.y) * r / after}`;
  }
  return path;
}
const ns = 'http://www.w3.org/2000/svg';
export class PortraitPainter {
  private paths = new Map<string, SVGPathElement>();
  private keep = new Set<string>();
  constructor(private svg: SVGSVGElement, prefix: string,
    private onHover?: (target: { side: Side; id: string; task?: boolean } | null) => void) {
    const defs = document.createElementNS(ns, 'defs'), gradient = document.createElementNS(ns, 'linearGradient');
    gradient.id = `${prefix}-portrait-ear`;
    for (const [offset, color] of [['0', 'var(--mark-agent-start)'], ['1', 'var(--mark-agent-end)']]) {
      const stop = document.createElementNS(ns, 'stop'); stop.setAttribute('offset', offset); stop.style.stopColor = color; gradient.append(stop);
    }
    defs.append(gradient); svg.append(defs); this.gradient = gradient.id;
  }
  private gradient: string;
  private path(key: string, d: string, className: string, opacity = 1, attrs: Record<string, string | number> = {}, hover?: { side: Side; id: string; task?: boolean }) {
    this.keep.add(key);
    let path = this.paths.get(key);
    if (!path) { path = document.createElementNS(ns, 'path'); this.paths.set(key, path); this.svg.append(path); }
    for (const [k, v] of Object.entries({ d, class: className, opacity, ...attrs })) path.setAttribute(k, String(v));
    path.onpointerenter = hover ? () => this.onHover?.(hover) : null;
    path.onpointerleave = path.onpointercancel = hover ? () => this.onHover?.(null) : null;
  }
  paint(a: TopologyAnimator, nodes: PaintNode[], tasks: PaintTask[], panel: SurfaceRect | null) {
    const h = a.values('hub'), p = a.values('portrait');
    if (!h || !p) return;
    this.keep.clear();
    const point = (x: number, y: number) => ({ x, y });
    for (const side of [-1, 1] as const) {
      const wing = nodes.filter(n => n.side === side && !n.parent).map(n => a.values(nodeKey(side, n.id))).filter(v => v && v.presence > 0.01);
      const x = side === -1 ? p.sourceX : p.agentX, y = h.y + side * p.earOffset;
      const edge = side === -1 ? Math.min(...wing.map(v => v!.y), y) : Math.max(...wing.map(v => v!.y), y);
      this.path(`rail${side}`, railPath([point(h.x + side * p.earHalf, y), point(x, y), point(x, edge)], 26), `portrait-rail ${side === -1 ? 'left' : 'right'}`, 0.45);
      this.path(`ear${side}`, railPath([point(h.x - p.earHalf, y), point(h.x + p.earHalf, y)]), `topology-ear ${side === -1 ? 'left' : 'right'}`, 1,
        { 'stroke-width': 14 * h.Re / 130, ...(side === 1 ? { style: `stroke:url(#${this.gradient})` } : {}) });
    }
    for (const node of nodes) {
      const key = nodeKey(node.side, node.id), n = a.values(key);
      if (!n) continue;
      const sideClass = node.side === -1 ? 'left' : 'right';
      const opacity = n.presence * (node.state === 'inactive' ? 0.2 : 0.55 + 0.3 * n.emphasis);
      const descendants = nodes.filter(c => c.parent === node.id && c.side === node.side).map(c => ({ node: c, value: a.values(nodeKey(c.side, c.id)) })).filter(c => c.value);
      if (descendants.length) {
        const bx = n.childBusX, ys = descendants.map(c => c.value!.y), start = point(n.x - node.side * (n.size * n.scale / 2 + 4), n.y);
        const lo = Math.min(n.y, ...ys), hi = Math.max(n.y, ...ys);
        this.path(`${key}:account-bus`, railPath([start, point(bx, n.y), point(bx, lo)]) + railPath([point(bx, n.y), point(bx, hi)]), `portrait-rail ${sideClass}`, opacity);
        for (const child of descendants) {
          const v = child.value!, d = railPath([point(bx, n.y), point(bx, v.y), point(v.x + node.side * (v.size * v.scale / 2 + 4), v.y)]);
          this.path(`${key}:${child.node.id}`, d, `portrait-rail ${sideClass}`, opacity * v.presence);
          this.path(`${key}:${child.node.id}:hit`, d, 'topology-path-hit', v.presence, {}, { side: node.side, id: child.node.id });
        }
      }
      const own = tasks.filter(t => t.side === node.side && t.parent === node.id).map(t => ({ task: t, value: a.values(taskKey(t.side, t.id)) })).filter(t => t.value);
      if (own.length) {
        const bx = n.taskBusX, ys = own.map(t => t.value!.y), start = point(n.x - n.size * n.scale / 2 - 4, n.y);
        const visible = Math.max(...own.map(t => t.value!.op));
        this.path(`${key}:task-bus`, railPath([start, point(bx, n.y), point(bx, Math.min(n.y, ...ys))]) + railPath([point(bx, n.y), point(bx, Math.max(n.y, ...ys))]), `portrait-rail ${sideClass}`, opacity * visible);
        for (const { task, value: v } of own) {
          const tk = taskKey(task.side, task.id);
          const d = railPath([point(bx, v!.y), point(v!.x, v!.y)]);
          this.path(tk, d, `portrait-task ${sideClass}`, v!.op, { 'data-state': task.state });
          this.path(`${tk}:flow`, task.state === 'running' || task.state === 'external' ? d : '', `portrait-task activity-flow ${sideClass}`, v!.op, { 'data-state': task.state });
          this.path(`${tk}:hit`, v!.op > 0.02 && a.live.get(tk)?.alive ? d : '', 'topology-path-hit', v!.op, {}, { side: task.side, id: task.id, task: true });
        }
      }
      if (panel && node.selected) {
        const end = node.side === 1 ? point(panel.x + panel.width, Math.max(panel.y + 27, Math.min(panel.y + panel.height - 27, n.y))) : point(Math.max(panel.x + 27, Math.min(panel.x + panel.width - 27, n.x)), panel.y);
        const start = point(n.x - node.side * (n.size * n.scale / 2 + 4), n.y);
        this.path(`${key}:panel`, railPath([start, point(n.childBusX, n.y), point(n.childBusX, end.y), end]), `portrait-rail ${sideClass}`, 0.9);
      }
    }
    for (const [key, path] of this.paths) if (!this.keep.has(key)) { path.remove(); this.paths.delete(key); }
  }
  dispose() { this.svg.replaceChildren(); this.paths.clear(); }
}
