import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { within, fireEvent } from "@testing-library/dom";

test("completed bubble read control isolates jitter, drag, cancellation and keyboard activation from topology", async () => {
  // Regression: the completed bubble check shared topology drag handling and had no movement or cancellation guard.
  const window = new Window({ url: "http://localhost" });
  const frames = new Map<number, FrameRequestCallback>(); let frame = 0;
  const media = { matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  window.matchMedia = () => media as unknown as MediaQueryList;
  class Observer { observe() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, localStorage: window.localStorage, getComputedStyle: window.getComputedStyle.bind(window),
    ResizeObserver: Observer, matchMedia: window.matchMedia, innerWidth: 1280, innerHeight: 800,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frame, callback); return frame; },
    cancelAnimationFrame: (id: number) => frames.delete(id), IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => 1280 }, clientHeight: { configurable: true, get: () => 800 },
  });
  const captures = new Map<number, Element>();
  window.HTMLElement.prototype.setPointerCapture = function (id: number) { captures.set(id, this); };
  window.HTMLElement.prototype.hasPointerCapture = function (id: number) { return captures.get(id) === this; };
  window.HTMLElement.prototype.releasePointerCapture = function (id: number) { captures.delete(id); };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("main"); document.body.append(mount); const root = createRoot(mount);
  try {
    const { default: Topology } = await server.ssrLoadModule("/ui/topology/Topology.tsx");
    const { ActivityBubble } = await server.ssrLoadModule("/ui/components/ActivityBubbles.tsx");
    const { agentPanel } = await server.ssrLoadModule("/ui/state/overviewPanels.ts");
    const { t } = await server.ssrLoadModule("/ui/i18n.ts");
    const session = { id: "finished", title: "Finished task", source: "arc-task", phase: "idle", phaseSince: null, headline: "", orderAt: 1, endedAt: 1 };
    let read = false, order: string[] = [];
    await act(() => root.render(h(Topology, { boundary: { current: mount }, left: [], right: [{ id: "codex", state: "normal", attention: false, selected: false,
      content: h("button", null, "Codex"), tasks: [{ id: session.id, width: 264, height: 76, state: "completed", selected: false, reorderable: true,
        content: h(ActivityBubble, { agent: "codex", session, now: 1, onRead: () => { read = true; } }) }] }],
      onReorderNodes() {}, onReorderTasks: (_side: number, _parent: string, ids: string[]) => { order = ids; } })));
    const page = within(mount), button = page.getByRole("button", { name: t("activity.markRead"), exact: true });
    const body = page.getByRole("button", { name: name => name.startsWith(session.title) });
    const pointer = async (target: Element, type: string, x: number, y: number, pointerType = "mouse") => act(() => {
      target.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, pointerType }));
    });
    const click = async (target: Element, detail = 1) => act(() => { fireEvent.click(target, { detail }); });
    for (const kind of ["mouse", "touch", "pen"]) {
      read = false;
      await pointer(button, "pointerdown", 20, 20, kind);
      await pointer(button, "pointermove", 23, 22, kind);
      await pointer(button, "pointerup", 23, 22, kind); await click(button);
      assert.equal(read, true); assert.equal(agentPanel.get(), undefined); assert.deepEqual(order, []);
      read = false;
      await pointer(button, "pointerdown", 20, 20, kind);
      await pointer(button, "pointermove", 20, 80, kind);
      await pointer(button, "pointermove", 20, 20, kind);
      await pointer(button, "pointerup", 20, 20, kind); await click(button);
      assert.equal(read, false); assert.equal(agentPanel.get(), undefined); assert.deepEqual(order, []);
      await pointer(button, "pointerdown", 20, 20, kind); await pointer(button, "pointercancel", 20, 20, kind); await click(button);
      assert.equal(read, false);
    }
    for (const key of ["Enter", " "]) {
      read = false;
      await act(() => { fireEvent.keyDown(button, { key }); fireEvent.keyUp(button, { key }); });
      // Happy DOM does not synthesize the native keyboard button click.
      await click(button, 0);
      assert.equal(read, true); assert.equal(agentPanel.get(), undefined); assert.deepEqual(order, []);
    }
    await pointer(body, "pointerdown", 100, 100); await pointer(body, "pointermove", 102, 101);
    await pointer(body, "pointerup", 102, 101); await click(body);
    assert.equal(agentPanel.get()?.session?.id, session.id);
    await act(() => agentPanel.set(undefined));
    await pointer(body, "pointerdown", 100, 100); await pointer(body, "pointermove", 100, 180);
    await pointer(body, "pointerup", 100, 180); await click(body);
    assert.equal(agentPanel.get(), undefined); assert.deepEqual(order, [session.id]);
    // A check click after a body drag must not inherit its suppressed click.
    read = false;
    await pointer(button, "pointerdown", 20, 20); await pointer(button, "pointerup", 20, 20); await click(button);
    assert.equal(read, true); assert.equal(agentPanel.get(), undefined);
  } finally { await act(() => root.unmount()); await server.close(); await window.happyDOM.close(); }
});
