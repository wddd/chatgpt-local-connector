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
        left, right, boundary, ref: topology, brand: "ARC", leftUtility: null, rightUtility: null,
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
    assertHub(); assert.ok(Math.abs(hub().x - 527.6) < 1e-6);
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
      const task = agent.tasks[0]; task.state = "external"; task.selected = true;
      await act(() => root.render(h(Parent)));
      for (let opening = 0; opening < 2; opening++) {
        for (const frame of [rect, { x: 520, y: 60, width: 350, height: 560 }, rect]) {
          await act(() => topology.current!.panelFrame(frame));
          const path = mount.querySelector(".secondary .external-wire")!.getAttribute("d")!;
          assert.ok(path && !/NaN|Infinity/.test(path), "every panel frame, including DOMRect, must retain a finite wire");
          assert.equal(Number(path.split(" ")[1]), frame.x, "first frame must already dock to the panel edge");
          assert.ok([...mount.querySelectorAll(".topology-wires path")].every(p => !/NaN|Infinity/.test(p.getAttribute("d") ?? "")));
        }
        await act(() => topology.current!.panelFrame(null));
        assert.ok(mount.querySelector(".secondary .external-wire")!.getAttribute("d"));
      }
      task.state = "running"; task.selected = false;
      await act(() => root.render(h(Parent)));
    }
  } finally {
    await act(() => root.unmount());
    await server.close(); await window.happyDOM.close();
  }
});
