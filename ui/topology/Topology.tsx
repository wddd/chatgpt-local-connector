import { useCallback, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import { solve, BUBBLE_W, type Side, type Scene } from "./solve";
import { TopologyAnimator, nodeKey, taskKey } from "./animate";
import { TopologyPainter, type PaintNode, type PaintTask } from "./render";
import type { SurfaceRect } from "../motion/surface";

export interface TaskView extends Omit<PaintTask, "parent" | "side"> { content: ReactNode }
export interface NodeView extends Omit<PaintNode, "side"> { content: ReactNode; tasks: TaskView[] }
type PositionedTask = TaskView & { parent: string; side: Side };
export interface TopologyHandle { panelFrame: (rect: SurfaceRect | null) => void }

export default function Topology({ left, right, brand, leftUtility, rightUtility, boundary, ref }: {
  left: NodeView[]; right: NodeView[]; brand: ReactNode; leftUtility: ReactNode; rightUtility: ReactNode;
  boundary: RefObject<HTMLElement | null>; ref: Ref<TopologyHandle>;
}) {
  const graph = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), hub = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLDivElement>()), utilities = useRef(new Map<Side, HTMLDivElement>());
  const animator = useRef(new TopologyAnimator()), painter = useRef<TopologyPainter | null>(null);
  const frame = useRef(0), lastTime = useRef(0), panel = useRef<SurfaceRect | null>(null);
  const origin = useRef({ x: 0, y: 0 }), size = useRef({ vw: 1000, vh: 650 });
  const reduced = useReducedMotion(), prefix = useId();
  const nodes = [...left.map(n => ({ ...n, side: -1 as const })), ...right.map(n => ({ ...n, side: 1 as const }))];
  const tasks = nodes.flatMap(n => n.tasks.map(t => ({ ...t, parent: n.id, side: n.side })));
  // Retain departing HTML until its primitive has collapsed into the port.
  const [retained, setRetained] = useState<PositionedTask[]>([]);
  const allTasks = [...new Map([...retained, ...tasks].map(t => [taskKey(t.side, t.id), t])).values()];
  const latest = useRef({ nodes, tasks, allTasks, left, right, reduced });
  latest.current = { nodes, tasks, allTasks, left, right, reduced };
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
      const list = latest.current.nodes.filter(n => n.side === side), last = list.at(-1), el = utilities.current.get(side);
      const v = last && a.values(nodeKey(side, last.id));
      const taskYs = latest.current.tasks.filter(t => t.side === side).map(t => a.values(taskKey(side, t.id))?.y ?? h.y);
      const bottom = Math.max(v ? v.y + 45 : h.y - 40, ...taskYs.map(y => y + 27));
      if (el) el.style.transform = `translate(${(v?.x ?? h.x + side * h.Re * 1.85) - 16}px, ${bottom + 16}px)`;
    }
    const rect = panel.current ? { ...panel.current, x: panel.current.x - origin.current.x, y: panel.current.y - origin.current.y } : null;
    painter.current?.paint(a, latest.current.nodes, latest.current.allTasks, rect, latest.current.tasks.some(t => t.selected));
  }, []);
  const tick = useCallback((time: number) => {
    frame.current = 0;
    const moving = animator.current.step(Math.min(0.064, lastTime.current ? (time - lastTime.current) / 1000 : 1 / 60), !!latest.current.reduced);
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
  const target = useCallback(() => {
    const scene: Scene = { ...size.current, left: latest.current.left, right: latest.current.right };
    animator.current.setTargets(solve(scene));
    if (latest.current.reduced) animator.current.step(0, true);
    paint(); wake();
  }, [paint, wake]);
  useImperativeHandle(ref, () => ({ panelFrame(rect) { panel.current = rect; paint(); } }), [paint]);
  useLayoutEffect(() => { setRetained(latest.current.allTasks); }, [left, right]);
  useLayoutEffect(() => { target(); });
  useLayoutEffect(() => {
    if (!svg.current || !boundary.current || !graph.current) return;
    painter.current = new TopologyPainter(svg.current, prefix);
    const container = boundary.current;
    const measure = () => {
      size.current = { vw: container.clientWidth, vh: container.clientHeight };
      const rect = graph.current!.getBoundingClientRect();
      origin.current = { x: rect.x, y: rect.y }; target();
    };
    const scroll = () => {
      const rect = graph.current!.getBoundingClientRect();
      origin.current = { x: rect.x, y: rect.y }; paint();
    };
    const observer = new ResizeObserver(measure); observer.observe(container);
    container.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame.current); frame.current = 0; lastTime.current = 0;
      observer.disconnect(); container.removeEventListener("scroll", scroll); window.removeEventListener("resize", measure);
      painter.current?.dispose(); painter.current = null;
    };
  }, [boundary, paint, prefix, target]);
  return <div ref={graph} className="connection-graph topology-scene">
    <svg ref={svg} className="topology-wires" aria-hidden="true" />
    <div ref={hub} className="topology-hub">{brand}</div>
    {nodes.map(n => <div key={nodeKey(n.side, n.id)} ref={el => { const key = nodeKey(n.side, n.id); if (el) elements.current.set(key, el); else elements.current.delete(key); }}
      className={`topology-node ${n.side === 1 ? "agents" : "sources"}`} data-highlighted={n.selected || undefined}>{n.content}</div>)}
    {allTasks.map(t => <div key={taskKey(t.side, t.id)} ref={el => { const key = taskKey(t.side, t.id); if (el) elements.current.set(key, el); else elements.current.delete(key); }}
      className="activity-slot" data-highlighted={t.selected || undefined}>{t.content}</div>)}
    <div className="topology-utility sources" ref={el => { if (el) utilities.current.set(-1, el); else utilities.current.delete(-1); }}>{leftUtility}</div>
    <div className="topology-utility agents" ref={el => { if (el) utilities.current.set(1, el); else utilities.current.delete(1); }}>{rightUtility}</div>
  </div>;
}
