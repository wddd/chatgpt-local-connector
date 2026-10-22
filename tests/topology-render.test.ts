import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment, HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement, HTMLSelectElement: window.HTMLSelectElement, CustomEvent: window.CustomEvent,
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
    const { agentPanel, selectAgentPanel } = await server.ssrLoadModule("/ui/state/overviewPanels.ts");
    const { agentActivity } = await server.ssrLoadModule("/ui/state/activity.ts");
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

test("control source dock preserves editing, new onboarding, field navigation and cross-side dispatch paths", async () => {
  const window = new Window({ url: "http://localhost" });
  const styles = window.document.createElement("style");
  styles.textContent = readFileSync(new URL("../ui/tokens.css", import.meta.url), "utf8")
    + readFileSync(new URL("../ui/product.css", import.meta.url), "utf8");
  window.document.head.append(styles);
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const media = { matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment, HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement, HTMLSelectElement: window.HTMLSelectElement,
    CustomEvent: window.CustomEvent, Event: window.Event, MutationObserver: window.MutationObserver, DOMRect: window.DOMRect, CSS: window.CSS,
    localStorage: window.localStorage, getComputedStyle: window.getComputedStyle.bind(window),
    ResizeObserver: Observer, matchMedia: () => media, innerHeight: 800, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1280 });
  window.matchMedia = () => media as unknown as MediaQueryList;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains("elastic-panel") ? new window.DOMRect(16, 16, 400, 768) : new window.DOMRect(550, 260, 44, 44);
  };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div"); document.body.append(mount); const root = createRoot(mount);
  const originalFetch = globalThis.fetch;
  try {
    const { default: Overview } = await server.ssrLoadModule("/ui/components/ConnectionOverview.tsx");
    const { default: UiProvider } = await server.ssrLoadModule("/ui/components/UiProvider.tsx");
    const { capturePanelOrigin } = await server.ssrLoadModule("/ui/components/panelMorph.ts");
    const { connector } = await server.ssrLoadModule("/ui/state/connector.ts");
    const { agentPanel, ingressPanel } = await server.ssrLoadModule("/ui/state/overviewPanels.ts");
    const { navigation } = await server.ssrLoadModule("/ui/state/navigation.ts");
    const { agentActivity } = await server.ssrLoadModule("/ui/state/activity.ts");
    const { tasks } = await server.ssrLoadModule("/ui/state/tasks.ts");
    const { agents } = await server.ssrLoadModule("/ui/state/agents.ts");
    const { t } = await server.ssrLoadModule("/ui/i18n.ts");
    const config = { configured: true, httpsProvider: "cloudflare", cloudflareMode: "quick", httpsUrl: "", tunnelId: "tunnel_fixture", hasApiKey: true };
    const source = (id: string) => ({ id, name: `Source ${id}`, controlSource: "claude", enabled: true, running: true, state: "ready", auth: "oauth", transport: "https", error: "", config, url: "https://example.com/mcp" });
    const status = { ingresses: [source("one"), source("two")], core: { backendSession: "fixture", appServer: { state: "ready" } }, platform: "darwin", logs: [], autoOpenCodex: false };
    connector.set({ status, loading: false, busy: "", error: "", feedback: { text: "", error: false } });
    agents.set({ items: [{ agent: "codex", installed: true, enabled: true, available: true, status: "ready" }], loading: false, error: "" });
    const session = { id: "thread", source: "codex-thread", title: "Dispatch fixture", phase: "command", headline: "Fixture", phaseSince: null, timeline: true };
    agentActivity.set({ snapshot: { observedAt: "2026-01-01", activeAgents: ["codex"], agents: { codex: { sessions: [session] } } }, error: "" });
    tasks.set({ records: [{ requestId: "dispatch", origin: { ingressId: "one" }, state: "completed", createdAt: "2026-01-01", task: { kind: "create", threadId: "thread", title: "Dispatch fixture", prompt: "Fixture" } }], error: "", loading: false });
    const calls: { path: string; method: string; body: any }[] = [];
    globalThis.fetch = async (input, init) => {
      const path = String(input).replace("/api/", ""), method = init?.method || "GET", body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ path, method, body });
      let value: unknown = {};
      if (path === "status") value = status;
      else if (path === "setup/next") value = { hasState: false, complete: false, goal: null, steps: [], step: null, progress: { done: 0, total: 0 }, cliPath: "arc", stateDir: "fixture" };
      else if (path === "relay/list") value = { relays: [], version: "test" };
      else if (path === "relay/progress") value = { phase: "idle" };
      else if (path === "tool-catalog") value = { tools: [], groups: [], required: [] };
      else if (path === "codex/login") value = { state: "authenticated" };
      else if (path.endsWith("/oauth")) value = { grants: [] };
      else if (path.startsWith("tasks/runtime/")) value = { runtimeStatus: "active", observedAt: "2026-01-01" };
      else if (path.startsWith("agents/timeline/")) value = { sessionId: "thread", status: "running", entries: [], cursor: 0, coverage: { state: "complete" } };
      else if (path === "ingress/one" && method === "PUT") { Object.assign(status.ingresses[0], body); value = status.ingresses[0]; }
      else if (path === "ingress/one" && method === "DELETE") status.ingresses = status.ingresses.filter(i => i.id !== "one");
      return new Response(JSON.stringify(value), { status: 200 });
    };
    const flush = async () => {
      for (let i = 0; i < 4; i++) await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(16));
      });
    };
    const click = async (node: Element | null) => { assert.ok(node); await act(() => (node as HTMLElement).click()); await flush(); };
    const button = (label: string, scope: ParentNode = document) => [...scope.querySelectorAll("button")].find(e => e.textContent === label || e.getAttribute("aria-label") === label)!;
    const escape = async () => { await act(() => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); await flush(); };
    await act(() => root.render(h(UiProvider, null, h("div", { onClickCapture: (e: { target: EventTarget }) => capturePanelOrigin(e.target) }, h(Overview)))));
    await flush();
    const first = () => mount.querySelector('[data-source-node="one"] button');
    await click(first());
    let shell = document.querySelector(".elastic-panel")!;
    assert.equal(shell.getAttribute("data-panel-dock"), "left");
    assert.equal(document.querySelector(".elastic-backdrop"), null);
    assert.ok([...document.querySelectorAll<HTMLInputElement>(".source-connection-card input")].some(input => input.value === t("connect.tryPrompt")));
    assert.ok(mount.querySelector('.activity-slot:not([inert])'), "right bubbles remain available");
    assert.equal(mount.querySelector('[data-source-node="one"]')?.getAttribute("data-reorderable"), null);
    await click(document.querySelector('[role="switch"]'));
    assert.ok(calls.some(c => c.path === "ingress/one" && c.method === "PUT" && c.body.enabled === false));
    await click(document.querySelector('[role="switch"]'));
    // Adding a control source replaces the current left dock without a backdrop.
    await click(mount.querySelector(".hub-source"));
    assert.equal(document.querySelector('[data-panel-dock]')?.getAttribute('data-panel-dock'), 'left');
    assert.equal(document.querySelector('.elastic-backdrop'), null);
    assert.ok(document.querySelector('.source-grid'));
    assert.equal(ingressPanel.get(), undefined);
    await escape();
    await click(first());
    shell = document.querySelector(".elastic-panel")!;
    const footer = shell.querySelector<HTMLElement>('.side-panel-layer > .dialog-footer')!;
    assert.equal(footer.previousElementSibling?.className, "side-panel-scroll");
    assert.equal(getComputedStyle(footer).borderTopWidth, "1px");
    assert.equal(getComputedStyle(footer).flexShrink, "0");
    await act(() => navigation.set({ ingressEdit: { id: "one" } })); await flush();
    assert.equal(document.querySelector(".elastic-panel"), shell);
    assert.ok(document.querySelector(".ingress-edit-layer form"));
    await click(button(t("back"), document.querySelector(".ingress-edit-layer")!));
    assert.equal(document.querySelector(".elastic-panel"), shell);
    await act(() => navigation.set({ ingressEdit: { id: "one", field: "name" } })); await flush();
    assert.equal(document.activeElement?.id, "ingress-name");
    assert.equal(navigation.get().ingressEdit, undefined);
    await click(button(t("save")));
    assert.equal(document.querySelector(".elastic-panel"), shell);
    assert.equal(document.querySelector(".ingress-edit-layer"), null);
    assert.equal(calls.filter(c => c.path === "ingress/one/start").length, 1, "save reconnects exactly once");
    await act(() => navigation.set({ ingressEdit: { id: "one" } })); await flush(); await click(button(t("cancel")));
    assert.equal(calls.filter(c => c.path === "ingress/one/start").length, 1, "cancelling edit does not replay autoConnect");
    await click(mount.querySelector('[data-source-node="two"] button'));
    assert.equal(document.querySelector(".elastic-panel"), shell);
    assert.equal(ingressPanel.get().ingress.id, "two");
    await escape(); assert.equal(ingressPanel.get(), undefined);
    assert.equal(document.activeElement, mount.querySelector('[data-source-node="two"] button'));
    await click(first()); await click(first()); assert.equal(ingressPanel.get(), undefined);
    await click(first()); await click(document.querySelector('.source-dispatch-row'));
    assert.equal(ingressPanel.get(), undefined); assert.equal(agentPanel.get().session.id, "thread");
    assert.equal(document.querySelectorAll('[data-panel-dock]').length, 1);
    assert.equal(document.querySelector('[data-panel-dock]')?.getAttribute('data-panel-dock'), 'right');
    const agentShell = document.querySelector('[data-panel-dock="right"]')!;
    await click(mount.querySelector('.hub-agent'));
    assert.equal(agentShell.getAttribute("data-recessed"), "true");
    assert.equal(agentShell.hasAttribute("inert"), true);
    assert.equal(getComputedStyle(agentShell).opacity, "0", "Agent dock is fully hidden below central management too");
    await escape();
    assert.equal(agentShell.hasAttribute("data-recessed"), false);
    assert.equal(agentShell.hasAttribute("inert"), false);
    await click(first()); assert.equal(agentPanel.get(), undefined); assert.ok(ingressPanel.get());
    await click(button(t("sourcePanel.allRecords")));
    assert.equal(navigation.get().page, "logs"); assert.equal(navigation.get().recordsSource, "one");
    await act(() => navigation.set({}));
    // New source selection stays in the left dock; ChatGPT uses the same link flow.
    for (const id of ["claude", "chatgpt", "custom"]) {
      await click(mount.querySelector(".hub-source"));
      assert.equal(document.querySelector('[data-panel-dock]')?.getAttribute('data-panel-dock'), 'left');
      assert.ok(document.querySelector('.source-grid'));
      await click(document.querySelector(`[data-source="${id}"]`));
      assert.ok(document.querySelector('.connection-steps'));
      assert.equal(document.querySelector('#ingress-tunnelId'), null);
      await click(button(t("back")));
      assert.ok(document.querySelector('.source-grid'));
      await escape();
    }
    await click(first());
    await act(() => navigation.set({ ingressEdit: { id: "one" } })); await flush();
    await click(button(t("remove")));
    assert.equal(ingressPanel.get(), undefined); assert.equal(document.querySelector('[data-panel-dock]'), null);
    assert.ok(calls.some(c => c.path === 'ingress/one' && c.method === 'DELETE'));
    assert.equal(document.querySelector('[data-source-node="one"]'), null);
    await act(() => { status.ingresses = []; connector.set({ ...connector.get(), status: { ...status } }); });
    await click(mount.querySelector('.hub-source'));
    assert.ok(document.querySelector(".welcome-choices"), "empty source wing opens the welcome choices");
    await escape();
    const { default: RecordsPage } = await server.ssrLoadModule("/ui/components/RecordsPage.tsx");
    await act(() => {
      connector.set({ ...connector.get(), status: { ...status, ingresses: [source("one"), source("two")], logs: [
        JSON.stringify({ ingressId: "one", msg: "Request processed: fixture-one" }),
        JSON.stringify({ ingressId: "two", msg: "Request processed: fixture-two" }),
      ] } });
      navigation.set({ recordsSource: "one" }); root.render(h(UiProvider, null, h(RecordsPage)));
    });
    await flush();
    assert.match(mount.querySelector(".log-table")!.textContent!, /fixture-one/);
    assert.doesNotMatch(mount.querySelector(".log-table")!.textContent!, /fixture-two/);
    assert.equal(mount.querySelectorAll(".source-dispatch-row").length, 1);
  } finally {
    await act(() => root.unmount()); globalThis.fetch = originalFetch;
    await server.close(); await window.happyDOM.close();
  }
});

test("timeline disclosures preserve choices through incremental grouping and render GFM and interaction receipts", async () => {
  const window = new Window({ url: "http://localhost" });
  const media = Object.assign(new window.EventTarget(), { matches: true });
  window.matchMedia = () => media as unknown as MediaQueryList;
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, DocumentFragment: window.DocumentFragment, localStorage: window.localStorage,
    getComputedStyle: window.getComputedStyle.bind(window), matchMedia: window.matchMedia,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
    cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div"); document.body.append(mount);
  const root = createRoot(mount);
  try {
    const { default: TimelineEntries } = await server.ssrLoadModule("/ui/components/TimelineEntries.tsx");
    const { activityApprovals } = await server.ssrLoadModule("/ui/state/activity.ts");
    const { interactionKey } = await server.ssrLoadModule("/ui/state/activityModel.ts");
    const { locale } = await server.ssrLoadModule("/ui/i18n.ts"); locale.set("en");
    const base = { cursor: 1, position: 1, turnId: "turn", startedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:01Z" };
    const first = { ...base, id: "first", type: "command", status: "running", command: "npm test", cwd: "/project", output: { text: "example output" } };
    const second = { ...base, id: "second", type: "file", operation: "read", status: "completed", path: "/project/src/file.ts", durationMs: 1000, changes: [{ path: "/project/src/file.ts", operation: "edit" }] };
    const session = { id: "example", source: "arc-task", phase: "command", phaseSince: null, headline: "npm test", timeline: true, project: "/project" };
    const render = async (entries: unknown[], now = Date.parse("2026-01-01T00:00:03Z")) => {
      await act(async () => { root.render(h(TimelineEntries, { entries, session, agent: "claude", now })); });
    };
    const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); };
    const expanded = (element: Element) => element.getAttribute("aria-expanded");
    await render([first]);
    assert.equal(mount.querySelector(".timeline-tool-group"), null, "a single tool is not grouped");
    assert.equal(mount.querySelectorAll(".timeline-current").length, 1);
    assert.ok(mount.querySelector(".timeline-tool.timeline-current"), "a single running tool is itself the current card");
    await click(mount.querySelector(".timeline-tool button")!);
    assert.equal(expanded(mount.querySelector(".timeline-tool button")!), "true");
    await render([first, second]);
    const group = mount.querySelector(".timeline-tool-group > button")!;
    assert.equal(expanded(group), "true");
    assert.equal(expanded(mount.querySelector(".timeline-tool button")!), "true", "single-to-group keeps tool disclosure");
    assert.match(group.textContent!, /Read 1 file, Run 1 command/);
    assert.equal(mount.querySelectorAll(".timeline-current").length, 0, "expanded groups do not duplicate the current tool");
    assert.match(mount.querySelector(".timeline-tool time")!.textContent!, /3s/);
    await click(group);
    assert.equal(expanded(group), "false");
    assert.ok(mount.querySelector(".timeline-current"), "current execution survives group collapse");
    await click(group);
    await render([{ ...first, status: "failed", durationMs: 4000, exitCode: 1 }, second]);
    assert.equal(expanded(mount.querySelector(".timeline-tool-group > button")!), "true", "manual expansion survives completion");
    assert.equal(mount.querySelector(".timeline-current"), null);
    assert.match(mount.querySelector(".timeline-tool-group > button")!.textContent!, /1 failed/);
    assert.match(mount.querySelector(".timeline-output")!.textContent!, /Exit code: 1/);
    await render([{ ...first, id: "automatic" }, { ...second, id: "automatic-file" }]);
    assert.equal(expanded(mount.querySelector(".timeline-tool-group > button")!), "true");
    await render([{ ...first, id: "automatic", status: "completed" }, { ...second, id: "automatic-file" }]);
    assert.equal(expanded(mount.querySelector(".timeline-tool-group > button")!), "false", "automatic expansion closes when finished");
    const thinking = { ...base, id: "thinking", type: "thinking", status: "completed", durationMs: 2000, text: "Reasoning detail" };
    const interaction = { kind: "question", summary: "Choose an option", respond: { op: "agent_respond", args: { agent: "claude", taskId: "example", interactionId: 1 } } };
    const pending = { ...base, id: "interaction", type: "interaction", status: "pending", interaction };
    const text = { ...base, id: "text", type: "text", status: "completed", text: '| Name | Value |\n| --- | --- |\n| A | B |\n\n- [x] Done\n\n[Docs](https://example.com/docs)\n\n```js\nconst value = 1;\n```\n\n<script>window.bad = true</script>' };
    await render([thinking, text, { ...text, id: "user", type: "user", text: "Request" }, pending]);
    assert.match(mount.querySelector(".timeline-thinking button")!.textContent!, /Thought for 2s/);
    assert.equal(expanded(mount.querySelector(".timeline-thinking button")!), "false");
    await click(mount.querySelector(".timeline-thinking button")!);
    await render([{ ...thinking, text: "Updated reasoning" }, text, pending]);
    assert.equal(expanded(mount.querySelector(".timeline-thinking button")!), "true");
    assert.match(mount.querySelector(".timeline-thought-text")!.textContent!, /Updated reasoning/);
    assert.ok(mount.querySelector("table td")); assert.ok(mount.querySelector('input[type="checkbox"][disabled]'));
    assert.ok(mount.querySelector("pre code")); assert.equal(mount.querySelector("script"), null);
    let opened = ""; window.open = ((url: string) => { opened = url; return null; }) as typeof window.open;
    await click(mount.querySelector('a[href="https://example.com/docs"]')!);
    assert.equal(opened, "https://example.com/docs");
    assert.match(mount.querySelector(".timeline-interaction")!.textContent!, /Waiting for approval/);
    const key = interactionKey("claude", { ...session, phaseSince: base.startedAt, interaction });
    await act(() => activityApprovals.set({ [key]: { status: "submitted", decision: "answer", requestId: "fixture" } }));
    assert.match(mount.querySelector(".timeline-interaction")!.textContent!, /Answered/);
    await act(() => activityApprovals.set({ [key]: { status: "submitted", decision: "deny", requestId: "fixture" } }));
    assert.match(mount.querySelector(".timeline-interaction")!.textContent!, /Denied/);
    await act(() => activityApprovals.set({}));
    await render([{ ...pending, status: "completed" }]);
    assert.match(mount.querySelector(".timeline-interaction")!.textContent!, /Resolved/);
    locale.set("zh-CN");
    await render([{ ...thinking, durationMs: undefined, startedAt: null }]);
    assert.equal(mount.querySelector(".timeline-thinking .phase-label")!.textContent, "思考");
    assert.equal(mount.querySelector(".timeline-thinking .phase-shimmer"), null);
    await render([{ ...thinking, durationMs: undefined, startedAt: null, status: "running" }]);
    assert.match(mount.querySelector(".timeline-thinking .phase-label")!.textContent!, /思考中/);
    assert.ok(mount.querySelector(".timeline-thinking .phase-shimmer"));
    if (mount.querySelector(".timeline-thinking button")!.getAttribute("aria-expanded") === "true") await click(mount.querySelector(".timeline-thinking button")!);
    await act(() => { media.matches = false; media.dispatchEvent(new window.Event("change")); });
    await click(mount.querySelector(".timeline-thinking button")!);
    assert.notEqual((mount.querySelector(".timeline-fold-content") as HTMLElement).style.opacity, "", "normal preference uses an animated disclosure");
    await act(() => { media.matches = true; media.dispatchEvent(new window.Event("change")); });
    assert.equal((mount.querySelector(".timeline-fold-content") as HTMLElement).style.opacity, "", "hot enabling reduced motion replaces active animation immediately");
    await click(mount.querySelector(".timeline-thinking button")!);
    await click(mount.querySelector(".timeline-thinking button")!);
    assert.equal((mount.querySelector(".timeline-fold-content") as HTMLElement).style.height, "", "later expansion remains static without remounting the timeline");
    await act(() => { media.matches = false; media.dispatchEvent(new window.Event("change")); });
    assert.notEqual((mount.querySelector(".timeline-fold-content") as HTMLElement).style.opacity, "", "motion can be re-enabled on the same timeline");
  } finally {
    await act(() => root.unmount()); await server.close(); window.happyDOM.abort(); mount.remove();
  }
});

test("mounted timeline follows the next poll after scrolling up and returning within 24px", async () => {
  const window = new Window({ url: "http://localhost" });
  let top = 0, height = 3482;
  const media = Object.assign(new window.EventTarget(), { matches: true });
  window.matchMedia = () => media as unknown as MediaQueryList;
  class Observer { observe() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, localStorage: window.localStorage, ResizeObserver: Observer, matchMedia: window.matchMedia,
    getComputedStyle: window.getComputedStyle.bind(window), IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperties(window.HTMLElement.prototype, {
    clientHeight: { configurable: true, get() { return this.className === "timeline-scroll" ? (document.querySelector('.timeline-latest') ? 710 : 754) : 0; } },
    scrollHeight: { configurable: true, get() { return this.className === "timeline-scroll" ? height : 0; } },
    scrollTop: { configurable: true, get() { return Math.min(top, Math.max(0, height - this.clientHeight)); }, set(value: number) { top = Math.min(value, Math.max(0, height - this.clientHeight)); } },
  });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div"); document.body.append(mount); const root = createRoot(mount);
  const originalFetch = globalThis.fetch;
  let revision = 1, reads = 0;
  globalThis.fetch = async () => { reads++; return new Response(JSON.stringify({ sessionId: 'follow', status: 'running', cursor: revision, coverage: { state: 'complete' }, entries: [{ id: 'answer', type: 'text', status: 'running', startedAt: null, updatedAt: '', turnId: 'turn', position: 1, cursor: revision, text: 'Increment '+revision }] })); };
  try {
    const { default: ActivityTimeline } = await server.ssrLoadModule('/ui/components/ActivityTimeline.tsx');
    const { agentActivity } = await server.ssrLoadModule('/ui/state/activity.ts');
    const session = { id: 'follow', source: 'arc-task', phase: 'text', headline: 'Response', phaseSince: null, timeline: true, orderAt: 0 };
    agentActivity.set({ error: '', snapshot: { observedAt: '', activeAgents: ['claude'], agents: { claude: { sessions: [session] } } } });
    await act(async () => { root.render(h(ActivityTimeline, { agent: 'claude', session, onClose() {}, onBack() {} })); });
    const viewport = mount.querySelector<HTMLElement>('.timeline-scroll')!;
    assert.equal(viewport.scrollTop, 2728, 'initial read follows to bottom');
    await act(() => { viewport.scrollTop = 100; viewport.dispatchEvent(new window.Event('scroll')); });
    assert.ok(mount.querySelector('.timeline-latest'));
    await act(() => { viewport.scrollTop = 2748; viewport.dispatchEvent(new window.Event('scroll')); });
    assert.equal(mount.querySelector('.timeline-latest'), null);
    assert.equal(viewport.scrollTop, 2728, 'removing the button clamps the scroll position upward');
    await act(() => viewport.dispatchEvent(new window.Event('scroll')));
    revision++; height = 3750;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    assert.ok(reads >= 2); assert.match(mount.textContent!, /Increment 2/);
    assert.equal(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop, 0, 'the next increment remains pinned to bottom');
    assert.equal(mount.querySelector('.timeline-latest'), null);
  } finally {
    await act(() => root.unmount()); globalThis.fetch = originalFetch;
    await server.close(); await window.happyDOM.close();
  }
});
