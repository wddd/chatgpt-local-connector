import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { fireEvent, within } from '@testing-library/dom';

test('Add SRC routes registry products to public pairing or local commands with core capability defaults', async () => {
  // Regression: removing the shared connection editor broke Add SRC before address copy and pairing.
  const window = new Window({ url: 'http://localhost' });
  const media = { matches: true, addEventListener() {}, removeEventListener() {} };
  class Observer { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia = () => media as unknown as MediaQueryList;
  Object.assign(globalThis, { window, document: window.document, location: window.location, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement,
    Element: window.Element, Node: window.Node, NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment,
    MutationObserver: window.MutationObserver, Event: window.Event, CustomEvent: window.CustomEvent, CSS: window.CSS,
    DOMRect: window.DOMRect, ResizeObserver: Observer, matchMedia: window.matchMedia, innerWidth: 1280, innerHeight: 800,
    getComputedStyle: window.getComputedStyle.bind(window), IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0), cancelAnimationFrame: clearTimeout });
  let copied = '';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: window.navigator.userAgent, languages: ['en'], clipboard: { writeText: async (value: string) => { copied = value; } } } });
  const originalFetch = globalThis.fetch;
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
  try {
    const { default: AddControlSource } = await server.ssrLoadModule('/ui/components/AddControlSource.tsx');
    const { default: ConnectionsPage } = await server.ssrLoadModule('/ui/components/ConnectionsPage.tsx');
    const { setPrivacy } = await server.ssrLoadModule('/ui/state/privacy.ts');
    const { default: UiProvider } = await server.ssrLoadModule('/ui/components/UiProvider.tsx');
    const { connector, refreshConnector } = await server.ssrLoadModule('/ui/state/connector.ts');
    const { onboarding, addedSource } = await server.ssrLoadModule('/ui/state/onboarding.ts');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const { resolvePage } = await server.ssrLoadModule('/ui/state/navigation.ts');
    const { publicRelay, publicRelayId } = await server.ssrLoadModule('/ui/state/relay.ts');
    for (const [old, current] of [['tasks', 'overview'], ['accounts', 'overview'], ['remote', 'connections'], ['permissions', 'settings']]) assert.equal(resolvePage(old), current);
    const owned = [{ owner: true, id: 'one' }, { owner: true, id: 'two' }];
    assert.equal(publicRelay(owned, ''), undefined);
    assert.equal(publicRelay(owned, 'two')?.id, 'two');
    assert.equal(publicRelay(owned, 'missing'), undefined);
    const page = within(document.body);
    const click = async (name: string) => { await act(async () => { fireEvent.click(page.getByRole('button', { name, exact: true })); }); };
    function Harness() {
      const flow = onboarding.use();
      return h(UiProvider, null, flow && h(AddControlSource));
    }
    for (const product of ['claude', 'custom', 'local-code', 'local-desktop']) {
      const local = product.startsWith('local-');
      publicRelayId.set('');
      let ingresses: any[] = [], sources: any[] = [], deployed = false, statusUnavailable = false;
      const ingressId = local ? 'local-claude-code' : 'public-link';
      const status = () => ({ ingresses, core: { appServer: { state: 'ready' } }, deviceName: 'Fixture computer', platform: product === 'local-desktop' ? 'win32' : 'darwin', logs: [], config: {} });
      const install = () => { assert.equal(ingresses.length, 0, 'A successful install must not be repeated after a read failure'); statusUnavailable = true; ingresses = [{ id: ingressId, name: local ? 'Local' : 'Public link', transport: local ? 'local' : 'relay', auth: local ? 'local' : 'oauth', enabled: true, running: true, state: 'ready', error: '', toolPolicy: 'all', config: { configured: true }, url: local ? '' : 'https://public.example.com/mcp', oauth: { pending: [], grants: [] } }]; };
      globalThis.fetch = async (input, init) => {
        const path = String(input).replace('/api/', ''), method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        let result: unknown;
        if (path === 'app/env') result = { active: false, overrides: {}, clock: { value: { nowMs: Date.now(), speed: 1 }, source: 'system' } };
        else if (path.startsWith('preferences')) result = { language: 'en', 'arc.privacy': 'false', ...(body.values ?? {}) };
        else if (path === 'status') {
          if (statusUnavailable) { statusUnavailable = false; return new Response(JSON.stringify({ error: 'Status temporarily unavailable' }), { status: 503 }); }
          result = status();
        }
        else if (path === 'source') result = { sources };
        else if (path === 'relay/list') result = { relays: deployed ? [{ id: 'relay', ingressId, owner: true }] : [], version: 'fixture' };
        else if (path === 'relay/create' && method === 'POST') { assert.equal(local, false); install(); deployed = true; result = { phase: 'connecting', action: 'create', jobId: 'job' }; }
        else if (path === 'relay/progress') result = deployed ? { phase: 'ready', action: 'create', jobId: 'job', result: { ingressId, relayId: 'relay' } } : { phase: 'idle' };
        else if (path === `ingress/${ingressId}/stop` && method === 'POST') { ingresses[0].running = false; ingresses[0].state = 'stopped'; result = {}; }
        else if (path === 'source/paired' && method === 'PUT') { assert.equal(Object.hasOwn(body, 'capabilityProfile'), false); Object.assign(sources[0], body); result = sources[0]; }
        else if (path === 'source/paired/claim' && method === 'POST') {
          assert.equal(body.sourceId, 'new');
          sources[0] = { ...sources[0], state: 'connected', connectedAt: 1, lastSeenAt: 1 };
          ingresses[0].oauth = { grants: [{ id: 'pairing' }], pending: [] }; result = sources[0];
        } else throw new Error(`Unexpected setup request: ${method} ${path}`);
        return new Response(JSON.stringify(result));
      };
      await act(async () => {
        connector.set({ status: status(), sources, sourcesLoaded: true, busy: '', loading: false, error: '', feedback: { text: '', error: false } });
        onboarding.set({ step: 'product', source: product });
        root.render(h(Harness));
      });
      await click(t('source.next'));
      if (local) {
        await click(t('copy'));
        assert.equal(copied, `${product === 'local-desktop' ? '' : "printf '%s' "}'{"body":{"target":"${product.slice(6)}"}}' | arc cli call local-access.install --stdin`);
        await click(t('source.done'));
        assert.equal(onboarding.get(), undefined);
        await act(async () => root.render(null));
        continue;
      }
      await click(t('source.createRelay'));
      await click(t('retry'));
      assert.equal(onboarding.get().step, 'address');
      await click(t('copy')); assert.equal(copied, ingresses[0].url);
      sources = [{ id: 'paired', ingressId, product, platform: 'anthropic', label: 'Fixture source', state: local ? 'connected' : 'disconnected', connectedAt: local ? 1 : null, lastSeenAt: local ? 1 : null, credential: local ? { type: 'local' } : { type: 'oauth-grant', grantId: 'pairing' } }];
      if (!local) ingresses[0].oauth.pending = [{ id: 'pairing', sourceId: 'paired', product, clientName: 'Claude', pairingCode: '2468', status: 'pending', redirectUri: '', resource: '' }];
      await act(async () => { await refreshConnector(); });
      if (!local) {
        assert.equal(onboarding.get().step, 'approval');
        assert.ok(page.getByText('2468'));
        assert.equal(page.queryByRole('radiogroup'), null);
        await click(t('oauthAllow'));
      }
      assert.equal(onboarding.get().step, 'success');
      await click(t('source.done'));
      assert.equal(onboarding.get(), undefined);
      assert.equal(addedSource.get(), 'paired');
      assert.equal(sources[0].state, 'connected');
      if (product === 'claude') {
        ingresses.push({ ...ingresses[0], id: 'local', transport: 'local', url: '', name: 'Local' },
          { ...ingresses[0], id: 'cli-extra', transport: 'https', url: 'https://extra.example.com/mcp', name: 'CLI proxy' });
        await act(async () => { setPrivacy(false); await refreshConnector(); root.render(h(UiProvider, null, h(ConnectionsPage))); });
        assert.ok(page.getByText('https://extra.example.com/mcp', { exact: true }));
        assert.ok(page.getByText(t('source.kind.local'), { exact: true }));
        await click(t('stop'));
        assert.equal(ingresses[0].running, false);
        assert.equal(ingresses[1].running, true);
        assert.equal(ingresses[2].running, true);
        assert.equal(page.queryByRole('button', { name: t('stop'), exact: true }), null);
        assert.ok(page.getByRole('button', { name: t('start'), exact: true }));
      }

      await act(async () => root.render(null));
    }
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch;
    await server.close(); await window.happyDOM.abort();
  }
});
