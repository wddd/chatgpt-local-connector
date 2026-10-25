import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h, useRef } from 'react';
import { within, fireEvent } from '@testing-library/dom';
import { assertNodeIdentity } from './helpers/dom-assert.ts';
import { portraitPanelRect, solvePortrait } from '../ui/topology/portrait.ts';

test('environment dimensions drive the mounted topology after settling and defer while dragging', async () => {
  // Regression: app_env width-only input could not drive portrait geometry or expose effective orientation in the live snapshot.
  const previousFetch = globalThis.fetch, window = new Window({ url: 'http://localhost' });
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  class Observer { observe() {} disconnect() {} }
  Object.assign(globalThis, {
    window, document: window.document, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    CustomEvent: window.CustomEvent, ResizeObserver: Observer, devicePixelRatio: 1,
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1280, innerHeight: 800, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
  try {
    const { default: Topology } = await server.ssrLoadModule('/ui/topology/Topology.tsx');
    const { appEnvironment } = await server.ssrLoadModule('/ui/state/appEnvironment.ts');
    const { topologyLayout } = await server.ssrLoadModule('/ui/subscriptions/displayPreferences.ts');
    const { viewModel } = await server.ssrLoadModule('/ui/acceptance.ts');
    const source = { id: 'source', label: 'Example source', state: 'normal', attention: false, selected: false, reorderable: true, tasks: [], content: h('button', null, 'Example source') };
    function Harness() {
      const boundary = useRef<HTMLElement>(null), handle = useRef(null);
      return h('section', { ref: boundary }, h(Topology, { left: [source], right: [], brand: h('span', null, 'ARC'),
        boundary, ref: handle, onReorderNodes() {}, onReorderTasks() {} }));
    }
    const settle = async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
      await act(async () => {
        for (let i = 0; frames.size && i < 10; i++) {
          const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(performance.now()));
        }
      });
    };
    const dimensions = (width: number, height: number) => {
      const now = Date.now();
      appEnvironment.set({ active: true, expiresAt: now + 60_000, realNowMs: now, overrides: { windowWidth: width, windowHeight: height, reducedMotion: true }, clock: { value: { nowMs: now, speed: 1 }, source: 'system' } });
    };
    await act(async () => root.render(h(Harness))); await settle();
    const button = within(mount).getByRole('button', { name: 'Example source' });
    assert.equal(viewModel().topology.orientation, 'landscape');
    await act(async () => fireEvent.pointerDown(button, { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100 }));
    await act(async () => dimensions(600, 1000)); await settle();
    assert.equal(viewModel().topology.orientation, 'landscape');
    assert.equal(viewModel().topology.orientationPending, true);
    await act(async () => fireEvent.pointerUp(button, { pointerId: 1, button: 0, isPrimary: true })); await settle();
    assert.equal(viewModel().topology.orientation, 'portrait');
    assert.equal(viewModel().topology.source, 'auto');
    assertNodeIdentity(within(mount).getByRole('button', { name: 'Example source' }), button);
    await act(async () => dimensions(900, 1000)); await settle();
    assert.equal(viewModel().topology.orientation, 'portrait');
    await act(async () => topologyLayout.set('landscape')); await settle();
    assert.equal(viewModel().topology.orientation, 'landscape');
    assert.equal(viewModel().topology.source, 'manual');
    assert.equal(localStorage.getItem('topology-layout'), 'landscape');
  } finally {
    await act(async () => root.unmount()); await server.close(); await window.happyDOM.abort();
    globalThis.fetch = previousFetch;
  }
});

test('portrait source content reports intrinsic height after its portal mounts and resizes', async () => {
  // Regression: the source portal mounted after its measuring effect, leaving the panel at its short default height.
  const window = new Window({ url: 'http://localhost' }), previousFetch = globalThis.fetch;
  const frames = new Map<number, FrameRequestCallback>(), subscriptions = new Set<() => void>();
  let sequence = 0, contentHeight = 460, reportedHeight = 0;
  class Observer {
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; }
    observe() { subscriptions.add(this.callback); }
    unobserve() { subscriptions.delete(this.callback); }
    disconnect() { subscriptions.delete(this.callback); }
  }
  const media = { matches: true, addEventListener() {}, removeEventListener() {} };
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment, CustomEvent: window.CustomEvent,
    Event: window.Event, MutationObserver: window.MutationObserver, DOMRect: window.DOMRect, CSS: window.CSS,
    localStorage: window.localStorage, getComputedStyle: window.getComputedStyle.bind(window), ResizeObserver: Observer,
    matchMedia: () => media, innerWidth: 900, innerHeight: 1600, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  window.matchMedia = () => media as unknown as MediaQueryList;
  // Happy DOM does not lay out content. Supply independent intrinsic and
  // transformed dimensions so the callback cannot mistake a motion frame for content.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => contentHeight });
  window.HTMLElement.prototype.getBoundingClientRect = () => new window.DOMRect(16, 380, 868, 44);
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
  try {
    const { default: IngressPanel } = await server.ssrLoadModule('/ui/components/IngressPanel.tsx');
    const { TooltipProvider } = await server.ssrLoadModule('/ui/components/ui/index.tsx');
    const { ingressPanel } = await server.ssrLoadModule('/ui/state/overviewPanels.ts');
    const entry = { id: 'source', name: 'Source fixture', controlSource: 'claude', enabled: true, config: {} };
    ingressPanel.set({ ingress: entry });
    const flush = async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      await act(async () => {
        for (let i = 0; frames.size && i < 10; i++) {
          const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(performance.now()));
        }
      });
    };
    const dockRect = { x: 16, y: 380, width: 868, height: 280 };
    await act(async () => root.render(h(TooltipProvider, null, h(IngressPanel, {
      dockRect, expanded: false, onToggleWidth() {}, onPanelFrame() {},
      onContentHeight: (height: number) => { reportedHeight = height; },
    }))));
    await flush();
    assert.ok(within(document.body).getByRole('dialog', { name: entry.name }));
    assert.ok(reportedHeight >= contentHeight);
    const scene = { vw: 900, vh: 1600, left: [{ id: entry.id, tasks: [] }], right: [] };
    const place = () => solvePortrait({ ...scene, panel: { side: -1, selected: entry.id, edge: 0, contentHeight: reportedHeight } });
    const first = place(), firstPanel = portraitPanelRect(first, first.wings[0].nodes[0]);
    assert.equal(firstPanel.height, reportedHeight);
    contentHeight *= 4;
    await act(async () => { for (const callback of subscriptions) callback(); }); await flush();
    assert.ok(reportedHeight >= contentHeight);
    const expanded = place(), expandedPanel = portraitPanelRect(expanded, expanded.wings[0].nodes[0]);
    assert.ok(expandedPanel.height > firstPanel.height && expandedPanel.height < reportedHeight);
    assert.ok(Math.abs((expanded.hub.y - first.hub.y) - (expandedPanel.height - firstPanel.height)) < 1e-6);
    contentHeight /= 8;
    await act(async () => { for (const callback of subscriptions) callback(); }); await flush();
    const smaller = place(), smallerPanel = portraitPanelRect(smaller, smaller.wings[0].nodes[0]);
    assert.equal(smallerPanel.height, reportedHeight);
    assert.ok(smallerPanel.height < firstPanel.height);
  } finally {
    await act(async () => root.unmount()); await server.close(); await window.happyDOM.abort();
    globalThis.fetch = previousFetch;
  }
});
