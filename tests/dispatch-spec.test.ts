import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { within } from '@testing-library/dom';

test('recorded dispatch specs expose readable catalog labels on focus and identify unresolved models', async () => {
  // Regression: resolved dsh JSON model IDs leaked into the tooltip and accessible name.
  const window = new Window({ url: 'http://localhost' });
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, DocumentFragment: window.DocumentFragment, MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent, localStorage: window.localStorage, ResizeObserver: Observer,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
    cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('div'); document.body.append(mount);
  const root = createRoot(mount);
  try {
    const { DispatchSpec } = await server.ssrLoadModule('/ui/components/composites/DispatchSpec.tsx');
    const { TooltipProvider } = await server.ssrLoadModule('/ui/components/ui/index.tsx');
    const { dispatchCatalogFixtures } = await server.ssrLoadModule('/ui/scenarioDispatchSpec.ts');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const catalog = dispatchCatalogFixtures.dsh;
    const { model, name } = catalog.models[0];
    const summary = { model, effort: 'max' };
    const records = [
      { kind: 'session', value: { id: 'dsh-task', source: 'arc-task', dispatchSummary: summary } },
      { kind: 'timeline', taskId: 'dsh-task', turnId: 'turn', value: { turnDispatchSummaries: { turn: summary } } },
      { kind: 'task', value: { agent: 'dsh', taskId: 'dsh-task', requestId: 'request', task: summary } },
    ];
    const page = within(document.body);
    const render = async (record: unknown, resolved = true) => {
      await act(() => root.render(h(TooltipProvider, null, h(DispatchSpec, {
        agent: 'dsh', record, resolver: { status: 'ready', catalog: resolved ? catalog : { models: [] } },
      }))));
    };
    for (const record of records) {
      await render(record);
      const chip = page.getByLabelText((label) => label.includes(name));
      assert.ok(!chip.getAttribute('aria-label')!.includes(model));
      await act(() => chip.focus());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      const tooltip = page.getByRole('tooltip');
      assert.ok(tooltip.textContent?.includes(name));
      assert.ok(!tooltip.textContent?.includes(model));
      await act(() => chip.blur());
    }
    await render(records[0], false);
    const unresolved = page.getByLabelText((label) => label.includes(model));
    assert.ok(unresolved.getAttribute('aria-label')!.includes(t('dispatchSpec.unresolved')));
    await act(() => unresolved.focus());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const tooltip = page.getByRole('tooltip');
    assert.ok(tooltip.textContent?.includes(model));
    assert.ok(tooltip.textContent?.includes(t('dispatchSpec.unresolved')));
  } finally {
    await act(() => root.unmount());
    await server.close();
    await window.happyDOM.close();
  }
});
