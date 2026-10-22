import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject, type PointerEvent, type MouseEvent } from "react";
import { useMedia } from "../state/hooks";
import { solve, BUBBLE_W, type Side, type Scene, type Drag, type Layout } from "./solve";
import { TopologyAnimator, nodeKey, taskKey } from "./animate";
import { TopologyPainter, type PaintNode, type PaintTask } from "./render";
import { orderedSubset, moveToY } from "./order";
import { topologyValues, topologyDebug } from "../state/topology";
import type { SurfaceRect } from "../motion/surface";

export interface TaskView extends Omit<PaintTask, "parent" | "side"> { content: ReactNode; reorderable?: boolean }
export interface NodeView extends Omit<PaintNode, "side"> { content: ReactNode; tasks: TaskView[]; reorderable?: boolean }
type PositionedTask = TaskView & { parent: string; side: Side };
export interface TopologyHandle { panelFrame: (rect: SurfaceRect | null) => void }

export default function Topology({ left, right, brand, leftUtility, rightUtility, boundary, onReorderNodes, onReorderTasks, ref }: {
  left: NodeView[]; right: NodeView[]; brand: ReactNode; leftUtility: ReactNode; rightUtility: ReactNode;
  onReorderNodes: (side: Side, ids: string[]) => void;
  onReorderTasks: (side: Side, parent: string, ids: string[]) => void;
  boundary: RefObject<HTMLElement | null>; ref: Ref<TopologyHandle>;
}) {
  const graph = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), hub = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLDivElement>()), utilities = useRef(new Map<Side, HTMLDivElement>());
  const animator = useRef(new TopologyAnimator()), painter = useRef<TopologyPainter | null>(null);
  const frame = useRef(0), lastTime = useRef(0), panel = useRef<SurfaceRect | null>(null);
  const origin = useRef({ x: 0, y: 0 }), size = useRef<{ vw: number; vh: number } | null>(null);
  const drag = useRef<(Drag & { pointer: number; startClientY: number; grab: number; parent?: string;
    order: string[]; active: boolean; target: HTMLElement; slot: HTMLElement; key: string }) | null>(null);
  const suppressedClick = useRef<string | null>(null);
  const reduced = useMedia("(prefers-reduced-motion: reduce)"), prefix = useId();
  const params = topologyValues.use(), { guides, slow } = topologyDebug.use();
  const layout = useRef<Layout | null>(null);
  const nodes = [...left.map(n => ({ ...n, side: -1 as const })), ...right.map(n => ({ ...n, side: 1 as const }))];
  const tasks = nodes.flatMap(n => n.tasks.map(t => ({ ...t, parent: n.id, side: n.side })));
  // Retain departing HTML until its primitive has collapsed into the port.
  const [retained, setRetained] = useState<PositionedTask[]>([]);
  const allTasks = [...new Map([...retained, ...tasks].map(t => [taskKey(t.side, t.id), t])).values()];
  const latest = useRef({ nodes, tasks, allTasks, left, right, reduced, params, guides, slow, onReorderNodes, onReorderTasks });
  latest.current = { nodes, tasks, allTasks, left, right, reduced, params, guides, slow, onReorderNodes, onReorderTasks };
  const paint = useCallback(() => {
    const a = animator.current, h = a.values("hub"), root = graph.current;
    if (!h || !root) return;
    root.style.height = `${a.values("scene")!.height}px`;
    if (hub.current) {
      const size = h.Re * 240 / 130; // Preserve the ARC mark's existing earmuff clearance.
      hub.current.style.width = hub.current.style.height = `${size}px`;
      hub.current.style.transform = `translate(${h.x - size / 2}px, ${h.y - size / 2}px)`;
    }
    for (const n of latest.current.nodes) {
      const key = nodeKey(n.side, n.id), v = a.values(key), el = elements.current.get(key);
      if (v && el) {
        el.style.transform = `translate(${v.x - 22}px, ${v.y - 22}px) scale(${v.scale})`;
        el.style.opacity = String(v.op);
      }
    }
    for (const t of latest.current.allTasks) {
      const key = taskKey(t.side, t.id), v = a.values(key), el = elements.current.get(key);
      if (!el) continue;
      el.style.opacity = String(v?.op ?? 0);
      el.style.pointerEvents = a.live.get(key)?.alive ? "" : "none";
      el.inert = !a.live.get(key)?.alive;
      if (v) el.style.transform = `translate(${v.x - (t.side === -1 ? BUBBLE_W : 0)}px, ${v.y - 27}px)`;
    }
    for (const side of [-1, 1] as const) {
      const v = a.values(`utility${side}`), el = utilities.current.get(side);
      if (el && v) el.style.transform = `translate(${v.x - 16}px, ${v.y - 16}px)`;
    }
    const rect = panel.current ? { ...panel.current, x: panel.current.x - origin.current.x, y: panel.current.y - origin.current.y } : null;
    svg.current?.style.setProperty("--topology-time-scale", latest.current.slow ? "4" : "1");
    painter.current?.paint(a, latest.current.nodes, latest.current.allTasks, rect, latest.current.tasks.some(t => t.selected),
      latest.current.guides ? layout.current : null);
  }, []);
  const tick = useCallback((time: number) => {
    frame.current = 0;
    const dt = Math.min(0.064, lastTime.current ? (time - lastTime.current) / 1000 : 1 / 60);
    const moving = animator.current.step(dt * (latest.current.slow ? 0.25 : 1), !!latest.current.reduced);
    lastTime.current = time; paint();
    if (moving) frame.current = requestAnimationFrame(tick);
    else {
      lastTime.current = 0;
      setRetained(old => {
        const remaining = old.filter(t => animator.current.live.has(taskKey(t.side, t.id)));
        return remaining.length === old.length ? old : remaining;
      });
    }
  }, [paint]);
  const wake = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(tick); }, [tick]);
  const scene = useCallback((): Scene => {
    const sc: Scene = { ...size.current!, left: latest.current.left, right: latest.current.right }, d = drag.current;
    if (!d?.active) return sc;
    const wing = d.side === -1 ? "left" : "right";
    if (d.kind === "node") sc[wing] = orderedSubset(sc[wing], d.order);
    else {
      const tasks = latest.current.tasks.filter(t => t.side === d.side && t.parent === d.parent);
      const attention = tasks.find(t => t.id === d.id)?.state === "attention";
      const allowed = new Set(tasks.filter(t => t.reorderable && (t.state === "attention") === attention).map(t => t.id));
      d.order = d.order.filter(id => allowed.has(id));
      sc[wing] = sc[wing].map(n => n.id === d.parent ? { ...n, tasks: orderedSubset(n.tasks, d.order) } : n);
    }
    return sc;
  }, []);
  const target = useCallback(() => {
    if (!size.current) return;
    let d = drag.current;
    if (d && (!(d.kind === "node" ? latest.current.nodes : latest.current.tasks).some(item => item.side === d!.side && item.id === d!.id)
      || latest.current.tasks.some(t => t.selected))) {
      delete d.slot.dataset.dragging; drag.current = null;
      if (d.target.hasPointerCapture(d.pointer)) d.target.releasePointerCapture(d.pointer);
      d = null;
    }
    animator.current.params = latest.current.params;
    layout.current = solve(scene(), latest.current.params, d?.active ? d : null);
    animator.current.setTargets(layout.current, d?.active ? d : null);
    // Pins follow the pointer immediately; their neighbours continue springing.
    animator.current.step(0, !!latest.current.reduced);
    paint(); wake();
  }, [paint, wake, scene]);
  const startDrag = (event: PointerEvent<HTMLDivElement>, kind: Drag["kind"], side: Side, id: string, parent?: string) => {
    if (event.button !== 0 || !event.isPrimary || latest.current.tasks.some(t => t.selected)) return;
    const key = kind === "node" ? nodeKey(side, id) : taskKey(side, id), v = animator.current.values(key);
    const button = (event.target as Element).closest("button");
    if (!v || !button || drag.current) return;
    suppressedClick.current = null;
    const candidates = kind === "node" ? latest.current.nodes.filter(n => n.side === side && n.reorderable)
      : latest.current.tasks.filter(t => t.side === side && t.parent === parent && t.reorderable
        && (t.state === "attention") === (latest.current.tasks.find(t => t.side === side && t.id === id)?.state === "attention"));
    drag.current = { kind, side, id, parent, y: v.y, pointer: event.pointerId, startClientY: event.clientY,
      grab: event.clientY - origin.current.y - v.y, order: candidates.map(n => n.id), active: false,
      target: button, slot: event.currentTarget, key };
    button.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    if (!d.active && Math.abs(event.clientY - d.startClientY) < 4) return;
    d.active = true; d.slot.dataset.dragging = "true"; suppressedClick.current = d.key;
    d.y = event.clientY - origin.current.y - d.grab;
    const layout = solve(scene(), latest.current.params), wing = layout.wings.find(w => w.side === d.side)!;
    const candidates = (d.kind === "node" ? wing.nodes : wing.tasks.filter(t => t.parent === d.parent)).filter(item => d.order.includes(item.id));
    if (!candidates.some(item => item.id === d.id)) { finishDrag(event, true); return; }
    d.order = moveToY(candidates, d.id, d.y);
    target(); event.preventDefault();
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    drag.current = null; delete d.slot.dataset.dragging;
    if (d.target.hasPointerCapture(d.pointer)) d.target.releasePointerCapture(d.pointer);
    if (d.active && !cancelled) {
      if (d.kind === "node") latest.current.onReorderNodes(d.side, d.order);
      else latest.current.onReorderTasks(d.side, d.parent!, d.order);
    }
    target();
  };
  const suppressClick = (event: MouseEvent, key: string) => {
    if (event.detail !== 0 && suppressedClick.current === key) { event.preventDefault(); event.stopPropagation(); }
  };
  useImperativeHandle(ref, () => ({ panelFrame(rect) { panel.current = rect; paint(); } }), [paint]);
  useLayoutEffect(() => { setRetained(latest.current.allTasks); }, [left, right]);
  useLayoutEffect(() => { target(); });
  // Parent host refs attach after child layout effects. Initialize after the
  // whole commit so the painter and viewport observer always mount together.
  useEffect(() => {
    if (!svg.current || !boundary.current || !graph.current) return;
    painter.current = new TopologyPainter(svg.current, prefix);
    const container = boundary.current;
    const measure = () => {
      const vw = container.clientWidth, vh = container.clientHeight;
      if (vw <= 0 || vh <= 0) return;
      size.current = { vw, vh };
      const rect = graph.current!.getBoundingClientRect();
      origin.current = { x: rect.x, y: rect.y }; target();
    };
    const scroll = () => {
      const rect = graph.current!.getBoundingClientRect();
      const dy = origin.current.y - rect.y;
      origin.current = { x: rect.x, y: rect.y };
      if (drag.current?.active) { drag.current.y += dy; target(); } else paint();
    };
    const observer = new ResizeObserver(measure); observer.observe(container);
    container.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", measure);
    measure();
    return () => {
      drag.current = null; size.current = null;
      cancelAnimationFrame(frame.current); frame.current = 0; lastTime.current = 0;
      observer.disconnect(); container.removeEventListener("scroll", scroll); window.removeEventListener("resize", measure);
      painter.current?.dispose(); painter.current = null;
    };
  }, [boundary, paint, prefix, target]);
  return <div ref={graph} className="connection-graph topology-scene"
    onPointerMove={moveDrag} onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)}
    onLostPointerCapture={event => finishDrag(event, true)}
    onKeyDownCapture={event => { if (event.key === "Escape" && drag.current) {
      const d = drag.current; drag.current = null; delete d.slot.dataset.dragging;
      if (d.target.hasPointerCapture(d.pointer)) d.target.releasePointerCapture(d.pointer);
      target(); event.preventDefault(); event.stopPropagation();
    } }}>
    <svg ref={svg} className="topology-wires" aria-hidden="true" />
    <div ref={hub} className="topology-hub">{brand}</div>
    {nodes.map(n => <div key={nodeKey(n.side, n.id)} ref={el => { const key = nodeKey(n.side, n.id); if (el) elements.current.set(key, el); else elements.current.delete(key); }}
      className={`topology-node ${n.side === 1 ? "agents" : "sources"}`} data-highlighted={n.selected || undefined} data-reorderable={n.reorderable || undefined}
      onPointerDown={n.reorderable ? event => startDrag(event, "node", n.side, n.id) : undefined}
      onClickCapture={event => suppressClick(event, nodeKey(n.side, n.id))}>{n.content}</div>)}
    {allTasks.map(t => <div key={taskKey(t.side, t.id)} ref={el => { const key = taskKey(t.side, t.id); if (el) elements.current.set(key, el); else elements.current.delete(key); }}
      className="activity-slot" data-highlighted={t.selected || undefined} data-reorderable={t.reorderable || undefined}
      onPointerDown={t.reorderable ? event => startDrag(event, "task", t.side, t.id, t.parent) : undefined}
      onClickCapture={event => suppressClick(event, taskKey(t.side, t.id))}>{t.content}</div>)}
    <div className="topology-utility sources" ref={el => { if (el) utilities.current.set(-1, el); else utilities.current.delete(-1); }}>{leftUtility}</div>
    <div className="topology-utility agents" ref={el => { if (el) utilities.current.set(1, el); else utilities.current.delete(1); }}>{rightUtility}</div>
  </div>;
}
