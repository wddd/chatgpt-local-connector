import { DEFAULTS, type Drag, type Entity, type Layout, type NodeGeometry, type Params, type Scene, type Side, type TaskGeometry, type Wing } from './solve.ts';
import { bubbleWidths } from '../state/activityModel.ts';

export interface PortraitGeometry {
  sourceX: number; agentX: number; sourceTop: number; sourceBottom: number; agentTop: number; agentBottom: number;
  earOffset: number; earHalf: number;
}

// Portrait owns rows and inward columns. Queue selection and account identity
// remain upstream, so switching orientation never rewrites either ordering.
export function solvePortrait(sc: Scene, p: Params = DEFAULTS, drag: Drag | null = null): Layout {
  const { vw, vh } = sc;
  const sourceX = Math.min(170, Math.max(64, vw * 170 / 900));
  const agentX = vw - Math.min(132, Math.max(56, vw * 132 / 900));
  const column = Math.min(88, Math.max(56, vw * 88 / 900));
  const busGap = Math.min(62, Math.max(30, vw * 62 / 900));
  const finalStub = Math.min(24, Math.max(12, vw * 24 / 900));
  const Re = Math.min(112, vw * 0.16) * p.ringScale;
  const earOffset = Re, earHalf = Re * 72 / 112;
  const hasTasks = (e: Entity): boolean => !e.collapsed && (e.tasks.length > 0 || !!e.children?.some(hasTasks));
  const busy = sc.right.some(hasTasks);
  const right = [...sc.right.filter(hasTasks), ...sc.right.filter(e => !hasTasks(e))];
  const taskRight = agentX - (right.some(e => !e.collapsed && e.children?.length) ? column : 0) - busGap - finalStub;
  const children = (e: Entity) => e.collapsed ? [] : e.children ?? [];
  const tasks = (e: Entity) => e.collapsed ? [] : e.tasks;
  const stackHeight = (e: Entity) => tasks(e).reduce((h, t) => h + t.height, 0) + Math.max(0, tasks(e).length - 1) * p.taskGap;
  const rowHeight = (e: Entity, side: Side, account = false): number => {
    const nested = children(e), own = stackHeight(e);
    const base = side === -1 ? account ? 48 : p.sourceRow : account ? 66 : busy && !hasTasks(e) ? p.minIdleRow : p.idleRow;
    const subtree = nested.reduce((h, child) => h + rowHeight(child, side, true), 0) + Math.max(0, nested.length - 1) * (side === -1 ? 0 : p.rowGap);
    return Math.max(base, own + (own ? 20 : 0) + subtree + (own && subtree ? p.rowGap : 0));
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
  const sourcePanelHeight = sc.panel?.side === -1 ? Math.min(sc.panel.contentHeight ?? 280, Math.max(120, vh * 0.5)) : 0;
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
    portrait: { sourceX, agentX, sourceTop, sourceBottom, agentTop, agentBottom, earOffset, earHalf },
    balance: [{ core: sourceX, full: vw / 2, squeeze: 1 }, { core: vw - agentX, full: vw / 2, squeeze: 1 }] };
}

export interface PortraitPanelRect { x: number; y: number; width: number; height: number }
// Coordinates are scene-local. The host converts them into viewport coordinates;
// vertical scrolling never feeds a panel's animated dimensions back into solve.
export function portraitPanelRect(layout: Layout, selected: NodeGeometry, scrollTop = 0, contentHeight = 280): PortraitPanelRect {
  const p = layout.portrait!;
  if (selected.side === -1) return { x: 16, y: p.sourceBottom + 24 - scrollTop, width: Math.max(1, layout.vw - 32),
    height: Math.min(contentHeight, Math.max(120, layout.vh * 0.5)) };
  const y = Math.max(16, layout.hub.y + p.earOffset + 16 - scrollTop);
  const right = selected.x - selected.size * selected.scale / 2 - 40;
  return { x: 16, y, width: Math.max(1, right - 16), height: Math.max(1, layout.vh - 96 - y) };
}
