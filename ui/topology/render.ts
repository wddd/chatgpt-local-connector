import { DEFAULTS, NODE_R, deg, type Side } from "./solve";
import { arcPath, grownWire } from "./geometry";
import { TopologyAnimator, nodeKey, taskKey } from "./animate";
import type { SurfaceRect } from "../motion/surface";

export type WireState = "normal" | "connecting" | "error" | "inactive";
export type TaskState = "running" | "attention" | "completed" | "external" | "summary";
export interface PaintNode { id: string; side: Side; state: WireState; attention: boolean; selected: boolean }
export interface PaintTask { id: string; parent: string; side: Side; state: TaskState; selected: boolean }
const ns = "http://www.w3.org/2000/svg";
function element<K extends keyof SVGElementTagNameMap>(tag: K, parent: SVGElement, attrs: Record<string, string> = {}) {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el); return el;
}
const attr = (el: SVGElement, attrs: Record<string, string | number>) => {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// Owns a single SVG subtree. React owns HTML contents; both consume the same frame.
export class TopologyPainter {
  private groups = new Map<string, { group: SVGGElement; outline: SVGPathElement; flow: SVGPathElement; gap: SVGPathElement;
    arc: SVGPathElement; gradient: SVGLinearGradientElement; solid: SVGStopElement; fade: SVGStopElement; end: SVGStopElement }>();
  private ears = new Map<Side, SVGPathElement>();
  private sequence = 0;
  constructor(readonly svg: SVGSVGElement, readonly prefix: string) {}
  private branch(key: string) {
    let branch = this.groups.get(key);
    if (branch) return branch;
    const group = element("g", this.svg), defs = element("defs", group);
    const gradient = element("linearGradient", defs, { id: `${this.prefix}-${++this.sequence}`, gradientUnits: "userSpaceOnUse" });
    element("stop", gradient, { offset: "0", "stop-opacity": "1" });
    const solid = element("stop", gradient, { "stop-opacity": "1" }), fade = element("stop", gradient), end = element("stop", gradient, { offset: "1" });
    const flow = element("path", group), outline = element("path", group), gap = element("path", group), arc = element("path", group);
    branch = { group, outline, flow, gap, arc, gradient, solid, fade, end };
    this.groups.set(key, branch); return branch;
  }
  paint(animator: TopologyAnimator, nodes: PaintNode[], tasks: PaintTask[], panel: SurfaceRect | null, focused: boolean) {
    const h = animator.values("hub");
    if (!h) return;
    const p = DEFAULTS, scale = h.Re / 130, keep = new Set<string>();
    for (const n of nodes) {
      const key = nodeKey(n.side, n.id), v = animator.values(key);
      if (!v) continue;
      keep.add(key);
      const b = this.branch(key), a = deg(v.port), radial = { x: n.side * Math.cos(a), y: Math.sin(a) };
      const port = { x: h.x + h.Re * radial.x, y: h.y + h.Re * radial.y };
      const start = { x: v.x - n.side * (NODE_R * v.scale + 6), y: v.y }, D = Math.hypot(start.x - port.x, start.y - port.y);
      const shape = grownWire(start, { x: start.x - n.side * D * p.t1Node, y: start.y },
        { x: port.x + radial.x * D * p.t1Root, y: port.y + radial.y * D * p.t1Root }, port, scale, p.flare, false, n.state === "connecting");
      attr(b.group, { class: `topology-branch primary ${n.side === 1 ? "right" : "left"}`, "data-state": n.state,
        opacity: focused && !n.selected ? 0.16 : 1 });
      attr(b.gradient, { x1: port.x, y1: port.y, x2: start.x, y2: start.y });
      attr(b.solid, { offset: Math.min(0.29, 10 * scale / Math.max(1, D)) });
      attr(b.fade, { offset: n.state === "connecting" ? Math.min(1, 26 * scale / Math.max(1, D)) : 0.3,
        "stop-opacity": n.state === "connecting" ? 0 : 0.7 });
      attr(b.end, { "stop-opacity": n.state === "connecting" ? 0 : n.side === 1 ? 0.42 : 0.32 });
      attr(b.outline, { d: shape.outline, fill: `url(#${b.gradient.id})`, opacity: n.state === "inactive" ? 0 : v.scale < 1 ? 0.3 : 0.78 });
      attr(b.flow, { class: "connecting-wire", d: n.state === "connecting" ? shape.centerline : "", "stroke-width": 3 * scale });
      attr(b.gap, { class: "wire-break", d: n.state === "error" ? shape.gap : "", "stroke-width": 18 * scale });
      attr(b.arc, { class: `topology-outer-arc ${n.attention ? "needs-attention" : ""}`,
        d: arcPath(v.x, v.y, v.radius, v.alo, v.ahi, n.side), opacity: v.aop, "stroke-width": 4 * Math.max(0.8, scale) });
    }
    for (const t of tasks) {
      const key = taskKey(t.side, t.id), v = animator.values(key), n = animator.values(nodeKey(t.side, t.parent));
      if (!v || !n) continue;
      keep.add(key);
      const b = this.branch(key), a = deg(v.port), radial = { x: t.side * Math.cos(a), y: Math.sin(a) };
      const port = { x: n.x + n.radius * radial.x, y: n.y + n.radius * radial.y };
      const end = t.selected && panel ? { x: t.side === 1 ? panel.x : panel.x + panel.width,
        y: clamp(v.y, panel.y + 27, panel.y + panel.height - 27) } : { x: v.x, y: v.y };
      const D = Math.hypot(end.x - port.x, end.y - port.y);
      const shape = grownWire(end, { x: end.x - t.side * D * p.t2End, y: end.y },
        { x: port.x + radial.x * D * p.t2Root, y: port.y + radial.y * D * p.t2Root }, port, scale, p.flare, true);
      attr(b.group, { class: `topology-branch secondary ${t.side === 1 ? "right" : "left"}`, "data-state": t.state,
        opacity: v.op * (focused && !t.selected ? 0.16 : 1) });
      attr(b.outline, { d: t.state === "external" ? "" : shape.outline, class: "task-body" });
      attr(b.flow, { d: ["running", "external"].includes(t.state) ? shape.centerline : "", class: t.state === "running" ? "activity-flow" : "external-wire" });
    }
    for (const [key, b] of this.groups) if (!keep.has(key)) { b.group.remove(); this.groups.delete(key); }
    for (const side of [-1, 1] as const) {
      let ear = this.ears.get(side);
      if (!ear) { ear = element("path", this.svg, { class: `topology-ear ${side === 1 ? "right" : "left"}` }); this.ears.set(side, ear); }
      const v = animator.values(`ear${side}`)!;
      attr(ear, { d: arcPath(h.x, h.y, h.Re, v.lo, v.hi, side), "stroke-width": 14 * scale, opacity: focused ? 0.16 : 1 });
      this.svg.append(ear); // caps cover the roots after additions as well
    }
  }
  dispose() { this.svg.replaceChildren(); this.groups.clear(); this.ears.clear(); }
}
