import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { within, fireEvent } from '@testing-library/dom';

async function harness() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  const window = new Window({ url: 'http://localhost' });
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0, time = 0;
  const media = { matches: false, addEventListener() {}, removeEventListener() {} };
  window.matchMedia = () => media as unknown as MediaQueryList;
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement, HTMLSelectElement: window.HTMLSelectElement,
    Node: window.Node, NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment,
    MutationObserver: window.MutationObserver, CustomEvent: window.CustomEvent, Event: window.Event,
    DOMRect: window.DOMRect, CSS: window.CSS, localStorage: window.localStorage,
    ResizeObserver: Observer, matchMedia: window.matchMedia, getComputedStyle: window.getComputedStyle.bind(window),
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => frames.delete(id) });
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => 1280 }, clientHeight: { configurable: true, get: () => 800 },
  });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('main'); document.body.append(mount);
  const root = createRoot(mount), page = within(mount);
  const advance = async () => act(() => {
    time += 1000 / 60;
    const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time));
  });
  const settle = async () => {
    for (let i = 0; i < 300 && frames.size; i++) await advance();
    assert.equal(frames.size, 0, 'Topology must stop scheduling frames after settling');
  };
  return { server, root, mount, page, frames, advance, settle,
    async close() { await act(() => root.unmount()); await server.close(); await window.happyDOM.close(); globalThis.fetch = originalFetch; } };
}

test('topology account source keeps its platform name in both modes', async () => {
  // Regression: single-account Tree nodes displayed a source alias instead of their platform name.
  const fixture = await harness();
  try {
    const { server, root, page } = fixture;
    const { default: Overview } = await server.ssrLoadModule('/ui/components/ConnectionOverview.tsx');
    const { default: UiProvider } = await server.ssrLoadModule('/ui/components/UiProvider.tsx');
    const { connector } = await server.ssrLoadModule('/ui/state/connector.ts');
    const { agents } = await server.ssrLoadModule('/ui/state/agents.ts');
    const { topologyMode } = await server.ssrLoadModule('/ui/topology/accountState.ts');
    const { controlSource } = await server.ssrLoadModule('/ui/controlSources.ts');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const source = { id: 'source-one', ingressId: 'ingress-one', credential: { type: 'oauth-grant', grantId: 'example-grant', clientId: 'example-client' }, product: 'chatgpt', platform: 'openai', label: 'Personal fixture', state: 'connected' };
    const ingress = { id: source.ingressId, sources: [source], name: 'Fixture ingress', controlSource: source.product,
      enabled: true, running: true, state: 'ready', auth: 'oauth', transport: 'https', error: '', config: { configured: true } };
    const status = { ingresses: [ingress], core: { backendSession: 'fixture', appServer: { state: 'ready' } }, platform: 'darwin', logs: [] };
    connector.set({ status, sources: [source], sourcesLoaded: true, loading: false, busy: '', error: '', feedback: { text: '', error: false } });
    agents.set({ items: [], loading: false, error: '' });
    globalThis.fetch = async input => new Response(JSON.stringify(String(input).endsWith('/accounts')
      ? { accounts: [{ id: 'account-one', alias: 'Personal', sources: [source.id], agentProfiles: [] }] }
      : { hasState: false, complete: true, steps: [], progress: { done: 0, total: 0 } }));
    await act(() => root.render(h(UiProvider, null, h(Overview))));
    const label = `${controlSource(source.product).displayName}: ${t('connected')}`;
    for (const mode of ['tree', 'flat']) {
      await act(() => topologyMode.set(mode));
      assert.ok(page.getByRole('button', { name: label, exact: true }));
      assert.equal(page.queryByRole('button', { name: name => name.startsWith(source.label) }), null);
    }
  } finally { await fixture.close(); }
});

test('topology account labels survive reordering and animation frames settle after highlight and collapse', async () => {
  // Regression: unidentified labels collided and path wires jumped while node opacity was still springing.
  const fixture = await harness();
  try {
    const { server, root, mount, page, advance, settle, frames } = fixture;
    const { accountViews } = await server.ssrLoadModule('/ui/topology/accountViews.tsx');
    const { default: Topology } = await server.ssrLoadModule('/ui/topology/Topology.tsx');
    const { viewModel } = await server.ssrLoadModule('/ui/acceptance.ts');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const accounts = ['b', 'a'].map(id => ({ id, alias: 'Unidentified', sources: [], agentProfiles: [{ agent: 'codex' }] }));
    const platform = { id: 'codex', platform: 'codex', platformLabel: 'Codex', label: 'Codex', state: 'normal', selected: false, attention: false,
      content: h('button', null, 'Codex'), tasks: accounts.map(account => ({ id: `task-${account.id}`, agentAccountId: account.id,
        state: 'running', selected: false, width: 200, height: 60, content: h('button', null, `Task ${account.id}`) })) };
    const boundary = { current: mount };
    let opened: string | undefined;
    const actions = { open: (_side: number, _platform: string, _source?: string, account?: string) => { opened = account; } };
    const render = async (mode: string, order: string[]) => {
      const right = accountViews([platform], 1, accounts, mode, { '1:codex': order }, actions);
      await act(() => root.render(h(Topology, { boundary, left: [], right, accountsEnabled: true, onReorderNodes() {}, onReorderTasks() {} })));
      await settle();
    };
    const snapshot = () => viewModel().topology;
    const names = new Map<string, string>();
    for (const mode of ['tree', 'flat', 'tree']) {
      await render(mode, mode === 'flat' ? ['a', 'b'] : ['b', 'a']);
      for (const account of accounts) {
        const node = snapshot().nodes.find((node: any) => node.accountId === account.id);
        const alias = mode === 'flat' ? node.label.slice(platform.platformLabel.length + 3) : node.label;
        if (names.has(account.id)) assert.equal(alias, names.get(account.id));
        names.set(account.id, alias);
        await act(() => fireEvent.click(page.getByRole('button', { name: node.label, exact: true })));
        assert.equal(opened, account.id);
      }
      assert.equal(new Set(names.values()).size, accounts.length);
    }
    const target = page.getByRole('button', { name: names.get('a')!, exact: true });
    await act(() => fireEvent.pointerOver(target));
    await advance();
    const fading = snapshot().nodes.find((node: any) => node.accountId === 'b').position;
    const bubble = snapshot().tasks.find((task: any) => task.id === 'task-b').position;
    assert.ok(fading.wireLight < 1 && fading.wireLight > 0.18);
    assert.ok(fading.light < 1 && fading.light > 0.32);
    assert.ok(bubble.light < 1 && bubble.light > 0.35);
    assert.ok(Math.abs((1 - fading.wireLight) / (1 - 0.18) - (1 - fading.light) / (1 - 0.32)) < 1e-8);
    assert.ok(Math.abs((1 - bubble.light) / (1 - 0.35) - (1 - fading.light) / (1 - 0.32)) < 1e-8);
    await settle();
    await act(() => fireEvent.pointerOut(target)); await settle();
    for (let cycle = 0; cycle < 3; cycle++) {
      await act(() => fireEvent.click(page.getByRole('button', { name: `${t('topology.collapse')} ${platform.label}`, exact: true })));
      await settle();
      assert.equal(page.queryByRole('button', { name: 'Task a', exact: true }), null);
      assert.equal(snapshot().tasks.length, 0);
      await act(() => fireEvent.click(page.getByRole('button', { name: `${t('topology.expand')} ${platform.label}`, exact: true })));
      await settle();
      assert.ok(page.getByRole('button', { name: 'Task a', exact: true }));
      assert.equal(snapshot().tasks.length, accounts.length);
    }
    await act(() => root.render(null));
    assert.equal(frames.size, 0, 'Unmount cancels scheduled animation');
  } finally { await fixture.close(); }
});
