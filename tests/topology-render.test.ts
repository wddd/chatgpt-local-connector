import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { act, createElement as h, createRef, useRef } from "react";
import { DEFAULTS, solve } from "../ui/topology/solve.ts";

test("mounted topology paints paths, observes its parent viewport and reacts to motion changes", async () => {
  const window = new Window({ url: "http://localhost" });
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0, time = 0, width = 1280, height = 800;
  const observers = new Set<ResizeObserverCallback>();
  class Observer {
    readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe(element: Element) { assert.equal(element.className, "boundary"); observers.add(this.callback); }
    disconnect() { observers.delete(this.callback); }
  }
  const media = new window.EventTarget() as InstanceType<typeof window.EventTarget> & { matches: boolean };
  media.matches = false;
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { configurable: true, get() { return this.className === "boundary" ? width : 0; } },
    clientHeight: { configurable: true, get() { return this.className === "boundary" ? height : 0; } },
  });
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, localStorage: window.localStorage,
    ResizeObserver: Observer, matchMedia: () => media, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, get: () => width });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div"); document.body.append(mount);
  const root = createRoot(mount);
  try {
    const { default: Topology } = await server.ssrLoadModule("/ui/topology/Topology.tsx");
    const { topologyValues, topologyDebug } = await server.ssrLoadModule("/ui/state/topology.ts");
    const nodes = (side: string, counts: number[]) => counts.map((n, i) => ({
      id: `${side}${i}`, state: "normal", selected: false, attention: false, content: h("button", null, `${side}${i}`),
      tasks: Array.from({ length: n }, (_, j) => ({ id: `${side}${i}/${j}`, state: "running", selected: false, content: h("button", null, "Task") })),
    }));
    const left = nodes("source", [0, 0, 0]), right = nodes("agent", [2, 3, 1, 0, 0, 0]);
    const topology = createRef<{ panelFrame(rect: { x: number; y: number; width: number; height: number } | null): void }>();
    function Parent() {
      const boundary = useRef<HTMLElement>(null);
      return h("section", { ref: boundary, className: "boundary" }, h(Topology, {
        left, right, boundary, ref: topology, brand: "ARC",
        onReorderNodes() {}, onReorderTasks() {},
      }));
    }
    const hub = () => {
      const el = mount.querySelector<HTMLElement>(".topology-hub")!;
      const [x, y] = el.style.transform.match(/-?[\d.]+/g)!.map(Number), radius = parseFloat(el.style.width) / 2;
      return { x: x + radius, y: y + radius };
    };
    const expected = () => solve({ vw: width, vh: height, left, right }, topologyValues.get()).hub;
    const assertHub = () => { const actual = hub(), target = expected(); assert.ok(Math.abs(actual.x - target.x) < 1e-6); assert.ok(Math.abs(actual.y - target.y) < 1e-6); };
    const settle = async () => {
      await act(() => {
        for (let i = 0; frames.size && i < 2000; i++) {
          const pending = [...frames.values()]; frames.clear(); time += 1000 / 60; pending.forEach(callback => callback(time));
        }
      });
      assert.equal(frames.size, 0, "settled topology must stop rAF");
    };
    const resize = async () => { await act(() => { for (const callback of observers) callback([], {} as ResizeObserver); }); };
    await act(() => root.render(h(Parent)));
    const paths = [...mount.querySelectorAll(".topology-wires path")].filter(p => p.getAttribute("d"));
    assert.ok(paths.length >= 17, "ears and both levels of branches must have nonempty paths after mounting");
    assert.equal(observers.size, 1, "the parent ref must be attached before observing");
    assert.equal(mount.querySelectorAll(".topology-ear").length, 2);
    assertHub(); assert.ok(Math.abs(hub().x - 527.05) < 1e-6);
    await act(() => topologyDebug.set({ guides: true, slow: false }));
    assert.ok(mount.querySelector(".topology-guides path")?.getAttribute("d"));
    await settle();
    const before = hub(); width = 1440; height = 820; await resize();
    assert.deepEqual(hub(), before, "resize must animate from the current position");
    await settle(); assertHub();
    await act(() => { media.matches = true; media.dispatchEvent(new window.Event("change")); });
    await act(() => topologyValues.set({ ...DEFAULTS, ringScale: 0.8 }));
    assertHub(); // No animation frame is needed when reduction changes during this mount.
    await settle();
    await act(() => { media.matches = false; media.dispatchEvent(new window.Event("change")); });
    const reducedHub = hub();
    await act(() => topologyValues.set(DEFAULTS));
    assert.deepEqual(hub(), reducedHub);
    await settle(); assertHub();
    await act(() => root.render(null));
    assert.equal(observers.size, 0); assert.equal(frames.size, 0);
    width = 0; height = 0;
    await act(() => root.render(h(Parent)));
    assert.equal(mount.querySelector(".topology-hub")!.getAttribute("style"), null, "zero-size containers must not use a fabricated viewport");
    width = 1280; height = 800; await resize(); await settle(); assertHub();
    assert.ok(mount.querySelector(".topology-ear")?.getAttribute("d"));
    width = 900; height = 680; await resize(); await settle();
    // ElasticPanel first sends a DOMRect (prototype accessors), then plain
    // interpolated frames, and finally another DOMRect before closing.
    const rect = Object.create({ get x() { return 484; }, get y() { return 16; },
      get width() { return 400; }, get height() { return 648; } });
    assert.deepEqual(Object.keys(rect), []);
    for (const agent of right.slice(0, 2)) {
      const task = agent.tasks[0]; task.state = "external"; task.selected = true; agent.selected = true;
      await act(() => root.render(h(Parent)));
      for (let opening = 0; opening < 2; opening++) {
        for (const frame of [rect, { x: 520, y: 60, width: 350, height: 560 }, rect]) {
          await act(() => topology.current!.panelFrame(frame));
          const path = mount.querySelector(".panel-link .activity-flow")!.getAttribute("d")!;
          assert.ok(path && !/NaN|Infinity/.test(path), "every panel frame, including DOMRect, must retain a finite wire");
          assert.equal(Number(path.split(" ")[1]), frame.x, "first frame must already dock to the panel edge");
          assert.ok([...mount.querySelectorAll(".topology-wires path")].every(p => !/NaN|Infinity/.test(p.getAttribute("d") ?? "")));
        }
        await act(() => topology.current!.panelFrame(null));
        assert.equal(mount.querySelector(".panel-link"), null);
      }
      await settle();
      assert.ok([...mount.querySelectorAll<HTMLElement>(".activity-slot")].every(el => el.inert && Number(el.style.opacity) === 0));
      assert.ok([...mount.querySelectorAll<HTMLElement>(".topology-node")].every(el => !el.inert));
      task.state = "running"; task.selected = false; agent.selected = false;
      await act(() => root.render(h(Parent)));
    }
    await settle();
    assert.ok([...mount.querySelectorAll<HTMLElement>(".activity-slot")].every(el => !el.inert && Number(el.style.opacity) === 1));
  } finally {
    await act(() => root.unmount());
    await server.close(); await window.happyDOM.close();
  }
});

test("Agent panel keeps a nonmodal shell across task/back/peer navigation and restores focus on Escape", async () => {
  const window = new Window({ url: "http://localhost" });
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const media = { matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    NodeFilter: window.NodeFilter, HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement, HTMLSelectElement: window.HTMLSelectElement, CustomEvent: window.CustomEvent,
    Event: window.Event, MutationObserver: window.MutationObserver, DOMRect: window.DOMRect, CSS: window.CSS,
    localStorage: window.localStorage, getComputedStyle: window.getComputedStyle.bind(window),
    ResizeObserver: Observer, matchMedia: () => media, innerHeight: 800, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1280 });
  window.matchMedia = () => media as unknown as MediaQueryList;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains("elastic-panel") ? new window.DOMRect(864, 16, 400, 768) : new window.DOMRect(680, 260, 44, 44);
  };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div"); document.body.append(mount);
  const root = createRoot(mount);
  try {
    const { default: AgentPanel } = await server.ssrLoadModule("/ui/components/AgentPanel.tsx");
    const { TooltipProvider } = await server.ssrLoadModule("/ui/components/ui/index.tsx");
    const { agentPanel, selectAgentPanel, agentActivity } = await server.ssrLoadModule("/ui/state/activity.ts");
    const { panelLayers } = await server.ssrLoadModule("/ui/state/panels.ts");
    const { capturePanelOrigin } = await server.ssrLoadModule("/ui/components/panelMorph.ts");
    const session = { id: "example", source: "transcript", title: "External example", phase: "thinking", phaseSince: null, headline: "Summary", timeline: false, orderAt: 1 };
    agentActivity.set({ error: "", snapshot: { observedAt: "2026-01-01", agents: { claude: { sessions: [session] } }, activeAgents: ["claude"] } });
    function Harness() {
      const view = agentPanel.use();
      const layers = panelLayers.use();
      return h("div", { onClickCapture: (event: { target: EventTarget }) => capturePanelOrigin(event.target) },
        h("main", { inert: layers.some((layer: HTMLElement) => !layer.dataset.panelDock) },
          ...["claude", "codex"].map(agent => h("div", { key: agent, "data-agent-node": agent },
            h("button", { className: "graph-node", "data-panel-anchor": true, onClick: () => selectAgentPanel({ type: "toggle", agent }) }, agent)))),
        view && h(AgentPanel, { agent: { agent: view.agent }, state: "connected", sessions: view.agent === "claude" ? [session] : [], now: 10,
          onSettings() {}, onPanelFrame() {} }));
    }
    const flush = async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      await act(() => { for (let i = 0; frames.size && i < 10; i++) { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(16)); } });
    };
    const click = async (node: Element) => { await act(async () => { (node as HTMLElement).click(); await Promise.resolve(); }); await flush(); };
    await act(() => root.render(h(TooltipProvider, null, h(Harness))));
    const claude = mount.querySelector('[data-agent-node="claude"] button')!, codex = mount.querySelector('[data-agent-node="codex"] button')!;
    await click(claude);
    const shell = document.querySelector(".elastic-panel");
    assert.ok(shell);
    assert.equal(document.querySelector(".elastic-backdrop"), null);
    assert.equal(mount.querySelector("main")!.inert, false);
    assert.equal(document.body.style.pointerEvents, "");
    assert.equal(document.querySelector('[aria-modal="true"]'), null);
    await click(document.querySelector(".activity-task-row")!);
    assert.equal(document.querySelector(".elastic-panel"), shell);
    assert.match(document.querySelector(".task-detail-layer h2")!.textContent!, /Claude Code \/ External example/);
    assert.equal(document.querySelector(".activity-approval-card"), null, "external detail remains read-only");
    await click(document.querySelector(".task-detail-layer .dialog-header button")!);
    assert.equal(document.querySelector(".elastic-panel"), shell);
    assert.equal(agentPanel.get().session, undefined);
    assert.equal(document.activeElement, document.querySelector(".activity-task-row"));
    await click(codex);
    assert.equal(document.querySelector(".elastic-panel"), shell, "peer switch never remounts the shell");
    assert.equal(agentPanel.get().agent, "codex");
    await act(() => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await flush();
    assert.equal(agentPanel.get(), undefined);
    assert.equal(document.querySelector(".elastic-panel"), null);
    assert.equal(document.activeElement, codex);
    await click(claude); await click(claude);
    assert.equal(agentPanel.get(), undefined, "clicking the same node dismisses the panel");
    // A bubble can open the second layer without visiting the Agent list first.
    const originalFetch = globalThis.fetch;
    let reads = 0;
    globalThis.fetch = async () => {
      reads++;
      return new Response(JSON.stringify({ sessionId: "owned", status: "completed", cursor: 1,
        coverage: { state: "partial", truncated: true }, entries: [{ id: "result", type: "text", text: "Retained result", status: "completed", cursor: 1, turnId: "turn", startedAt: null, updatedAt: "2026-01-01" }] }), { status: 200 });
    };
    try {
      await act(async () => selectAgentPanel({ type: "task", agent: "claude", session: { ...session, id: "owned", source: "arc-task", timeline: true } }));
      await flush();
      assert.equal(reads, 1);
      const detailShell = document.querySelector(".elastic-panel");
      assert.match(document.querySelector(".timeline-entries")!.textContent!, /Retained result/);
      await act(() => agentActivity.set({ error: "offline", snapshot: { observedAt: "2026-01-02", agents: {}, activeAgents: [] } }));
      assert.equal(document.querySelector(".elastic-panel"), detailShell);
      assert.match(document.querySelector(".timeline-entries")!.textContent!, /Retained result/);
      await click(document.querySelector(".task-detail-layer .dialog-header button")!);
      assert.equal(document.querySelector(".elastic-panel"), detailShell);
      assert.equal(document.querySelector(".task-detail-layer"), null);
      await act(() => selectAgentPanel({ type: "closed" }));
      await flush();
    } finally { globalThis.fetch = originalFetch; }

  } finally {
    await act(() => root.unmount());
    await server.close(); await window.happyDOM.close();
  }
});
