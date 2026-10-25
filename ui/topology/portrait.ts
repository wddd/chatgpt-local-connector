import { DEFAULTS, NODE_R, type Drag, type Entity, type Layout, type NodeGeometry, type Params, type Scene, type Side, type TaskGeometry, type Wing } from './solve.ts';
import { bubbleWidths } from '../state/activityModel.ts';

export interface PortraitGeometry {
  sourceX: number; agentX: number; sourceTop: number; sourceBottom: number; agentTop: number; agentBottom: number;
  earOffset: number; earHalf: number;
  sourceLabelWidth: number; agentLabelWidth: number; sourceAccountLabelWidth: number; agentAccountLabelWidth: number;
  sourcePanelHeight: number;
}
export interface PortraitLabel { width: number; twoLineWidth: number; height: number }
export interface PortraitLabels { left: ReadonlyMap<string, PortraitLabel>; right: ReadonlyMap<string, PortraitLabel> }

// Portrait owns rows and inward columns. Queue selection and account identity
// remain upstream, so switching orientation never rewrites either ordering.
export function solvePortrait(sc: Scene, p: Params = DEFAULTS, drag: Drag | null = null, labels?: PortraitLabels): Layout {
  const { vw, vh } = sc;
  const column = Math.min(88, Math.max(56, vw * 88 / 900));
  const busGap = Math.min(62, Math.max(30, vw * 62 / 900));
  const finalStub = Math.min(24, Math.max(12, vw * 24 / 900));
  const Re = Math.min(112, vw * 0.16) * p.ringScale;
  const earOffset = Re, earHalf = Re * 72 / 112;
  const hasTasks = (e: Entity): boolean => !e.collapsed && (e.tasks.length > 0 || !!e.children?.some(hasTasks));
  const busy = sc.right.some(hasTasks);
  const right = [...sc.right.filter(hasTasks), ...sc.right.filter(e => !hasTasks(e))];
  const children = (e: Entity) => e.collapsed ? [] : e.children ?? [];
  const tasks = (e: Entity) => e.collapsed ? [] : e.tasks;
  const scale = (e: Entity, side: Side, account = false) => account ? 36 / (NODE_R * 2)
    : p.nodeSize / (NODE_R * 2) * (hasTasks(e) ? p.activeScale : side === 1 && busy ? p.minIdleScale : 1);
  const label = (e: Entity, side: Side) => labels?.[side === -1 ? 'left' : 'right'].get(e.id);
  const extents = (list: readonly Entity[], side: Side, account = false) => ({
    width: Math.max(0, ...list.map(e => (label(e, side)?.width ?? 0) * scale(e, side, account))),
    twoLineWidth: Math.max(0, ...list.map(e => (label(e, side)?.twoLineWidth ?? 0) * scale(e, side, account))),
    offset: Math.max(0, ...list.map(e => (NODE_R + 12) * scale(e, side, account))),
  });
  const sourceLabels = extents(sc.left, -1), agentLabels = extents(right, 1);
  const sourceAccounts = extents(sc.left.flatMap(children), -1, true);
  const agentAccounts = extents(right.flatMap(children), 1, true);
  const hierarchy = (right.some(e => children(e).length) ? column : 0) + busGap + finalStub;
  // Keep complete single-line labels until the narrow bubble floor no longer fits.
  // Two-line measurements are the lower bound; bubbles absorb any remaining squeeze.
  const agentLabelWidth = Math.max(agentLabels.twoLineWidth, Math.min(agentLabels.width, vw - 32 - hierarchy - bubbleWidths.narrow - agentLabels.offset));
  const agentX = vw - 16 - agentLabels.offset - agentLabelWidth;
  const sourceHierarchy = sc.left.some(e => children(e).length) ? column + sourceAccounts.offset : 0;
  const sourceAvailable = vw - 32 - sourceLabels.offset - sourceHierarchy;
  const sourceLabelWidth = Math.max(sourceLabels.twoLineWidth, Math.min(sourceLabels.width, sourceAvailable - sourceAccounts.width));
  const sourceAccountLabelWidth = Math.max(sourceAccounts.twoLineWidth, Math.min(sourceAccounts.width, sourceAvailable - sourceLabelWidth));
  const sourceX = 16 + sourceLabels.offset + sourceLabelWidth;
  const accountX = agentX - column;
  const agentAccountLabelWidth = Math.min(agentAccounts.width, 2 * Math.max(1, Math.min(accountX - 16, vw - 16 - accountX)));
  const taskRight = agentX - hierarchy;
  const stackHeight = (e: Entity) => tasks(e).reduce((h, t) => h + t.height, 0) + Math.max(0, tasks(e).length - 1) * p.taskGap;
  const rowHeight = (e: Entity, side: Side, account = false): number => {
    const nested = children(e), own = stackHeight(e);
    const base = side === -1 ? account ? 48 : p.sourceRow : account ? 66 : busy && !hasTasks(e) ? p.minIdleRow : p.idleRow;
    const subtree = nested.reduce((h, child) => h + rowHeight(child, side, true), 0) + Math.max(0, nested.length - 1) * (side === -1 ? 0 : p.rowGap);
    const measured = label(e, side), s = scale(e, side, account);
    const labelWidth = side === -1 ? account ? sourceAccountLabelWidth : sourceLabelWidth : account ? agentAccountLabelWidth : agentLabelWidth;
    const labelHeight = (measured?.height ?? 0) * s * (measured && measured.width * s > labelWidth ? 2 : 1);
    const labelRow = side === 1 && account ? 2 * (18 + 4 * s + labelHeight) : labelHeight + 16;
    return Math.max(base, labelRow, own + (own ? 20 : 0) + subtree + (own && subtree ? p.rowGap : 0));
  };
  function wing(list: readonly Entity[], side: Side, top: number): Wing {
    const nodes: NodeGeometry[] = [], bubbles: TaskGeometry[] = [];
    const place = (e: Entity, y: number, x: number, parent?: string): number => {
      const height = rowHeight(e, side, !!parent), own = tasks(e), nested = children(e);
      const active = hasTasks(e), idle = side === 1 && busy && !active && !parent;
      const node: NodeGeometry = { id: e.id, parent, tasks: own, active, side, x, y: y + height / 2,
        size: parent ? 36 : p.nodeSize, scale: parent ? 1 : active ? p.activeScale : idle ? p.minIdleScale : 1,
        opacity: idle ? 0.62 : 1, dim: idle, port: 0, arc: null,
        taskBusX: x - busGap, childBusX: x - side * column / 2 };
      if (drag?.kind === 'node' && drag.side === side && drag.id === e.id) {
        node.x = drag.x; node.y = drag.y;
        node.taskBusX = drag.x - busGap; node.childBusX = drag.x - side * column / 2;
      }
      nodes.push(node);
      let taskY = nested.length ? y + 10 : node.y - stackHeight(e) / 2;
      for (const task of own) {
        const width = Math.min(Math.max(bubbleWidths.narrow, Math.min(480, taskRight - 16)), Math.max(1, taskRight - 16));
        const moved = drag?.kind === 'task' && drag.side === side && drag.id === task.id;
        bubbles.push({ ...task, width, parent: e.id, side, port: 0, anchor: 1,
          x: moved ? Math.max(width + 16, Math.min(taskRight, drag.x)) : taskRight,
          y: moved ? drag.y : taskY + task.height / 2 });
        taskY += task.height + p.taskGap;
      }
      let childY = y + (own.length ? stackHeight(e) + 20 + p.rowGap : (height - nested.reduce((h, c) => h + rowHeight(c, side, true), 0) - Math.max(0, nested.length - 1) * (side === -1 ? 0 : p.rowGap)) / 2);
      for (const child of nested) childY += place(child, childY, x - side * column, e.id) + (side === -1 ? 0 : p.rowGap);
      return height;
    };
    let y = top;
    for (const e of list) y += place(e, y, side === -1 ? sourceX : agentX) + p.rowGap;
    return { side, nodes, tasks: bubbles, H: Math.max(0, y - top - p.rowGap), ear: { lo: 0, hi: 0 } };
  }
  const sourceTop = 74, left = wing(sc.left, -1, sourceTop);
  const sourceBottom = sourceTop + left.H;
  const sourcePanelHeight = sc.panel?.side === -1 ? Math.min(sc.panel.contentHeight ?? 280, vh * 0.55) : 0;
  const hub = { x: vw / 2, y: sourceBottom + 56 + earOffset + (sourcePanelHeight ? sourcePanelHeight + 40 : 0), Re };
  const agentTop = hub.y + earOffset + 56, agents = wing(right, 1, agentTop);
  const agentBottom = agentTop + agents.H;
  for (const wing of [left, agents]) {
    if (sc.panel?.side !== wing.side) continue;
    const hidden = new Set<string>();
    for (const node of wing.nodes) {
      if (node.parent && (node.parent === sc.panel.selected || hidden.has(node.parent))) { node.opacity = 0; hidden.add(node.id); }
    }
    for (const task of wing.tasks) { task.hidden = true; task.x += 12; }
  }
  return { vw, vh, sceneH: Math.max(vh, agentBottom + 112), hub, wings: [left, agents],
    portrait: { sourceX, agentX, sourceTop, sourceBottom, agentTop, agentBottom, earOffset, earHalf,
      sourceLabelWidth, agentLabelWidth, sourceAccountLabelWidth, agentAccountLabelWidth, sourcePanelHeight },
    balance: [{ core: sourceX, full: vw / 2, squeeze: 1 }, { core: vw - agentX, full: vw / 2, squeeze: 1 }] };
}

export interface PortraitPanelRect { x: number; y: number; width: number; height: number }
export function portraitSourcePanelRoute(node: Pick<NodeGeometry, 'x' | 'y' | 'size' | 'scale' | 'childBusX'>, parentBusX: number | undefined, panel: PortraitPanelRect) {
  const busX = parentBusX ?? node.childBusX ?? node.x;
  const direction = Math.sign(busX - node.x);
  const start = { x: node.x + direction * (node.size * node.scale / 2 + 4), y: node.y };
  const endX = Math.max(panel.x + 27, Math.min(panel.x + panel.width - 27, busX));
  return [start, { x: busX, y: node.y }, { x: busX, y: panel.y - 20 }, { x: endX, y: panel.y - 20 }, { x: endX, y: panel.y }];
}
// Coordinates are scene-local. The host converts them into viewport coordinates;
// vertical scrolling never feeds a panel's animated dimensions back into solve.
export function portraitPanelRect(layout: Layout, selected: NodeGeometry, scrollTop = 0): PortraitPanelRect {
  const p = layout.portrait!;
  if (selected.side === -1) return { x: 16, y: p.sourceBottom + 24 - scrollTop, width: Math.max(1, layout.vw - 32),
    height: p.sourcePanelHeight };
  const y = Math.max(16, layout.hub.y + p.earOffset + 16 - scrollTop);
  const right = selected.x - selected.size * selected.scale / 2 - 40;
  return { x: 16, y, width: Math.max(1, right - 16), height: Math.max(1, layout.vh - 96 - y) };
}
