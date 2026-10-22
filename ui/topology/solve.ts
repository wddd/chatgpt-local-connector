// Metadata is the single source for solver defaults, controls and validation.
export const PARAMETER_GROUPS = {
  balance: { en: "Balance", "zh-CN": "平衡" },
  hub: { en: "Hub and earmuffs", "zh-CN": "中心与耳罩" },
  primary: { en: "Primary branches", "zh-CN": "一级触手" },
  secondary: { en: "Outer arcs and task branches", "zh-CN": "外弧与二级触手" },
  rows: { en: "Rows", "zh-CN": "行布局" },
  motion: { en: "Motion", "zh-CN": "动效" },
} as const;
export const PARAMETERS = [
  { key: "bubbleWeight", group: "balance", label: { en: "Bubble visual weight", "zh-CN": "气泡视觉权重" }, min: 0, max: 1, step: 0.05, default: 0.8 },
  { key: "margin", group: "balance", label: { en: "Window margin", "zh-CN": "窗口留白" }, min: 16, max: 120, step: 2, default: 40 },
  { key: "squeezeMin", group: "balance", label: { en: "Minimum column ratio", "zh-CN": "最小列距比例" }, min: 0.5, max: 1, step: 0.02, default: 0.72 },
  { key: "ringScale", group: "hub", label: { en: "Ring size", "zh-CN": "环尺寸" }, min: 0.6, max: 1.4, step: 0.02, default: 1 },
  { key: "earFollow", group: "hub", label: { en: "Port target following", "zh-CN": "端口随目标" }, min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: "earSep", group: "hub", label: { en: "Minimum port spacing (°)", "zh-CN": "端口最小间隔°" }, min: 2, max: 16, step: 0.5, default: 7 },
  { key: "earMax", group: "hub", label: { en: "Maximum half-angle (°)", "zh-CN": "最大半角°" }, min: 20, max: 60, step: 1, default: 42 },
  { key: "earMin", group: "hub", label: { en: "Minimum half-angle (°)", "zh-CN": "最小半角°" }, min: 8, max: 40, step: 1, default: 22 },
  { key: "earPad", group: "hub", label: { en: "Arc end padding (°)", "zh-CN": "弧端余量°" }, min: 0, max: 16, step: 1, default: 7 },
  { key: "t1Node", group: "primary", label: { en: "Node tension", "zh-CN": "节点端张力" }, min: 0.1, max: 0.8, step: 0.02, default: 0.42 },
  { key: "t1Root", group: "primary", label: { en: "Root tension", "zh-CN": "根部端张力" }, min: 0.05, max: 0.7, step: 0.02, default: 0.3 },
  { key: "flare", group: "primary", label: { en: "Root flare", "zh-CN": "根部展宽" }, min: 0, max: 2, step: 0.05, default: 1 },
  { key: "arcGap", group: "secondary", label: { en: "Outer arc gap", "zh-CN": "外弧间距" }, min: 4, max: 30, step: 1, default: 11 },
  { key: "arcFollow", group: "secondary", label: { en: "Port target following", "zh-CN": "端口随目标" }, min: 0, max: 1, step: 0.05, default: 0.75 },
  { key: "arcMax", group: "secondary", label: { en: "Maximum half-angle (°)", "zh-CN": "最大半角°" }, min: 20, max: 75, step: 1, default: 58 },
  { key: "arcPad", group: "secondary", label: { en: "Arc end padding (°)", "zh-CN": "弧端余量°" }, min: 0, max: 20, step: 1, default: 9 },
  { key: "bubbleOffset", group: "secondary", label: { en: "Bubble offset", "zh-CN": "气泡距节点" }, min: 60, max: 220, step: 2, default: 104 },
  { key: "t2Root", group: "secondary", label: { en: "Root tension", "zh-CN": "根部端张力" }, min: 0.05, max: 0.7, step: 0.02, default: 0.34 },
  { key: "t2End", group: "secondary", label: { en: "Bubble tension", "zh-CN": "气泡端张力" }, min: 0.1, max: 0.8, step: 0.02, default: 0.5 },
  { key: "colDist", group: "rows", label: { en: "Column distance", "zh-CN": "节点列距" }, min: 0.9, max: 2.6, step: 0.02, default: 1.85 },
  { key: "pitch", group: "rows", label: { en: "Task pitch", "zh-CN": "任务槽高" }, min: 52, max: 80, step: 1, default: 64 },
  { key: "rowGap", group: "rows", label: { en: "Row gap", "zh-CN": "行间距" }, min: 0, max: 30, step: 1, default: 12 },
  { key: "sourceRow", group: "rows", label: { en: "Source row height", "zh-CN": "控制源行高" }, min: 56, max: 96, step: 1, default: 78 },
  { key: "idleRow", group: "rows", label: { en: "Idle Agent row height", "zh-CN": "Agent 空闲行高" }, min: 40, max: 84, step: 1, default: 58 },
  { key: "idleIndent", group: "rows", label: { en: "Idle indentation", "zh-CN": "空闲左缩进" }, min: 0, max: 60, step: 1, default: 22 },
  { key: "idleScale", group: "rows", label: { en: "Idle scale", "zh-CN": "空闲缩放" }, min: 0.5, max: 1, step: 0.02, default: 0.78 },
  { key: "minIdleRow", group: "rows", label: { en: "Minimum idle row height", "zh-CN": "压缩下限" }, min: 34, max: 60, step: 1, default: 44 },
  { key: "stiffness", group: "motion", label: { en: "Stiffness", "zh-CN": "刚度" }, min: 60, max: 600, step: 5, default: 210 },
  { key: "damping", group: "motion", label: { en: "Damping", "zh-CN": "阻尼" }, min: 8, max: 60, step: 1, default: 26 },
] as const;
export type ParameterKey = typeof PARAMETERS[number]["key"];
export type Params = Record<ParameterKey, number>;
export const DEFAULTS = Object.fromEntries(PARAMETERS.map(p => [p.key, p.default])) as Params;
export type Side = -1 | 1;
export interface Task { id: string }
export interface Entity { id: string; tasks: readonly Task[] }
export interface Scene { vw: number; vh: number; left: readonly Entity[]; right: readonly Entity[] }
export interface Drag { kind: "node" | "task"; side: Side; id: string; y: number }
export interface Point { x: number; y: number }
export interface NodeGeometry extends Point {
  id: string; tasks: readonly Task[]; active: boolean; scale: number; opacity: number; dim: boolean; side: Side;
  port: number; arc: { R: number; lo: number; hi: number } | null;
}
export interface TaskGeometry extends Point { id: string; parent: string; side: Side; port: number }
interface WingOptions { idleStyle: boolean; rowScale: number; squeeze: number }
interface Row { e: Entity; n: number; h: number }
export interface Wing { side: Side; H: number; nodes: NodeGeometry[]; ear: { lo: number; hi: number }; utility: Point; tasks: TaskGeometry[] }
export interface WingBalance { core: number; full: number; effective: number; squeeze: number }
export interface Layout { balance: WingBalance[]; vw: number; vh: number; sceneH: number; hub: Point & { Re: number }; wings: Wing[] }
export const deg = (d: number) => d * Math.PI / 180;
export const NODE_R = 22, BUBBLE_W = 232, BUBBLE_H = 54, LABEL_W = 110;

// Distribute port angles: follow each target's direction, keep a minimum
// separation in order, and fit the run inside ±max. Returns degrees.
export function distribute(raw: number[], follow: number, sep: number, max: number) {
  const a = raw.map((r) => Math.max(-max, Math.min(max, r * follow)));
  for (let i = 1; i < a.length; i++) a[i] = Math.max(a[i], a[i - 1] + sep);
  const over = a.length ? a[a.length - 1] - max : 0;
  if (over > 0) for (let i = 0; i < a.length; i++) a[i] -= over;
  for (let i = a.length - 2; i >= 0; i--) a[i] = Math.min(a[i], a[i + 1] - sep);
  const lo = a.length ? a[0] : 0;
  if (lo < -max) {
    const span = a[a.length - 1] - a[0], scale = span > 0 ? (2 * max) / span : 1;
    for (let i = 0; i < a.length; i++) a[i] = -max + (a[i] - lo) * Math.min(1, scale);
  }
  return a;
}

// Wing options: the agent wing styles idle nodes (smaller, indented, faded);
// the source wing never changes its nodes because of the other side.
function wingRows(list: readonly Entity[], p: Params, opt: Pick<WingOptions, "idleStyle" | "rowScale">): Row[] {
  return list.map((e) => {
    const n = e.tasks.length;
    const base = opt.idleStyle ? Math.max(p.minIdleRow, p.idleRow * opt.rowScale) : Math.max(56, p.sourceRow * opt.rowScale);
    return { e, n, h: n > 0 ? Math.max(base, n * p.pitch + 10) : base };
  });
}
function wingHeight(rows: Row[], p: Params) { return rows.reduce((s, r) => s + r.h, 0) + p.rowGap * Math.max(0, rows.length - 1); }

function solveWing(list: readonly Entity[], side: Side, hub: Point, Re: number, p: Params, opt: WingOptions, drag: Drag | null): Wing {
  const rows = wingRows(list, p, opt);
  const H = wingHeight(rows, p);
  let y = hub.y - H / 2;
  const colX = hub.x + side * Re * p.colDist * opt.squeeze;
  const nodes: NodeGeometry[] = rows.map((r) => {
    const active = r.n > 0, idle = opt.idleStyle && !active;
    const ny = y + r.h / 2; y += r.h + p.rowGap;
    const nodeDrag = drag && drag.kind === 'node' && drag.id === r.e.id;
    return { id: r.e.id, port: 0, arc: null, tasks: r.e.tasks, active, x: colX - side * (idle ? p.idleIndent : 0),
      y: nodeDrag ? drag.y : ny, scale: idle ? p.idleScale : 1, opacity: idle ? 0.62 : 1, dim: idle, side };
  });
  // Earmuff ports follow the direction from the hub to each node.
  const raw = nodes.map((n) => Math.atan2(n.y - hub.y, Math.abs(n.x - hub.x)) * 180 / Math.PI);
  const ang = distribute(raw, p.earFollow, p.earSep, p.earMax);
  nodes.forEach((n, i) => { n.port = ang[i]; });
  const lo = Math.min(-p.earMin, ang.length ? ang[0] - p.earPad : 0);
  const hi = Math.max(p.earMin, ang.length ? ang[ang.length - 1] + p.earPad : 0);
  // Tasks: fixed-size bubbles in ordered slots around the node, ports on an outer arc.
  const tasks: TaskGeometry[] = [];
  nodes.forEach((n) => {
    if (!n.active) { n.arc = null; return; }
    const R = NODE_R + p.arcGap, k = n.tasks.length;
    const slots = n.tasks.map((t, i) => (drag && drag.kind === 'task' && drag.id === t.id) ? drag.y : n.y + (i - (k - 1) / 2) * p.pitch);
    const rawT = n.tasks.map((_, i) => Math.atan2(n.y + (i - (k - 1) / 2) * p.pitch - n.y, p.bubbleOffset) * 180 / Math.PI);
    const tA = distribute(rawT, p.arcFollow, 9, p.arcMax);
    n.arc = { R, lo: Math.min(-14, tA[0] - p.arcPad), hi: Math.max(14, tA[tA.length - 1] + p.arcPad) };
    n.tasks.forEach((t, i) => {
      tasks.push({ id: t.id, parent: n.id, side, port: tA[i], x: n.x + side * p.bubbleOffset, y: slots[i] });
    });
  });
  // Utilities occupy the fixed tail, independent of the pointer's displacement.
  const last = rows.at(-1);
  const utility = { x: nodes.at(-1)?.x ?? colX,
    y: last ? hub.y + H / 2 + Math.max(16, 64 - last.h / 2) + 16 : hub.y };
  return { side, H, nodes, ear: { lo, hi }, utility, tasks };
}

export function extentOf(w: Wing, hubX: number, Re: number) {
  let core = Math.max(Re * 1.15, Math.abs(w.utility.x - hubX) + 16);
  w.nodes.forEach((n) => { core = Math.max(core, Math.abs(n.x - hubX) + LABEL_W / 2); });
  let full = core;
  w.tasks.forEach((t) => { full = Math.max(full, Math.abs(t.x - hubX) + BUBBLE_W); });
  return { core, full };
}

export function solve(sc: Scene, p: Params = DEFAULTS, drag: Drag | null = null): Layout {
  const vw = sc.vw, vh = sc.vh, pad = 70, m = p.margin;
  const Re = Math.max(vw < 600 ? 48 : 80, Math.min(130, vw * 0.13, vh * 0.2)) * p.ringScale;
  // Vertical: each wing compresses only itself, the agent wing through idle rows,
  // the source wing through its own row height; whatever still overflows scrolls.
  const fitRow = (list: readonly Entity[], idleStyle: boolean) => {
    const h1 = wingHeight(wingRows(list, p, { idleStyle, rowScale: 1 }), p);
    if (h1 <= vh - 2 * pad) return 1;
    const h0 = wingHeight(wingRows(list, p, { idleStyle, rowScale: 0 }), p);
    const idleRows = list.filter((e) => !e.tasks.length).length || 1;
    const unit = idleStyle ? p.idleRow : p.sourceRow;
    return Math.max(0, Math.min(1, (vh - 2 * pad - h0) / (unit * idleRows)));
  };
  const optL = { idleStyle: false, rowScale: fitRow(sc.left, false), squeeze: 1 };
  const optR = { idleStyle: true, rowScale: fitRow(sc.right, true), squeeze: 1 };
  const hL = wingHeight(wingRows(sc.left, p, optL), p), hR = wingHeight(wingRows(sc.right, p, optR), p);
  const sceneH = Math.max(vh, Math.max(hL, hR) + pad * 2);
  const at = (x: number) => ({ x, y: sceneH / 2 });
  const dragOf = (side: Side) => drag && drag.side === side ? drag : null;
  // Horizontal: squeeze column distances only when the whole scene cannot fit.
  const measure = () => {
    const L = solveWing(sc.left, -1, at(0), Re, p, optL, dragOf(-1));
    const R = solveWing(sc.right, 1, at(0), Re, p, optR, dragOf(1));
    return { eL: extentOf(L, 0, Re), eR: extentOf(R, 0, Re) };
  };
  let e = measure();
  const avail = vw - 2 * m;
  for (let i = 0; i < 24 && e.eL.full + e.eR.full > avail; i++) {
    if (optL.squeeze > p.squeezeMin) optL.squeeze = Math.max(p.squeezeMin, optL.squeeze - 0.02);
    else if (optR.squeeze > p.squeezeMin) optR.squeeze = Math.max(p.squeezeMin, optR.squeeze - 0.02);
    else break;
    e = measure();
  }
  // Balance: centre the optically weighted bounds, then let the window edges
  // push the hub — a long right wing squeezes the ring toward free left space.
  const eff = (x: { core: number; full: number }) => x.core + p.bubbleWeight * (x.full - x.core);
  let hx = vw / 2 + (eff(e.eL) - eff(e.eR)) / 2;
  const minX = m + e.eL.full, maxX = vw - m - e.eR.full;
  if (minX <= maxX) hx = Math.max(minX, Math.min(maxX, hx));
  else hx = minX; // cannot fit: keep the left wing whole, truncate the right edge
  const hub = { x: hx, y: sceneH / 2, Re };
  const L = solveWing(sc.left, -1, hub, Re, p, optL, dragOf(-1));
  const R = solveWing(sc.right, 1, hub, Re, p, optR, dragOf(1));
  return { vw, vh, sceneH, hub, wings: [L, R], balance: [
    { ...e.eL, effective: eff(e.eL), squeeze: optL.squeeze },
    { ...e.eR, effective: eff(e.eR), squeeze: optR.squeeze },
  ] };
}
