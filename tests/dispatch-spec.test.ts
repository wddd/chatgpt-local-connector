import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { within } from '@testing-library/dom';
import { modelLabel } from '../ui/components/composites/dispatchSpecLabel.ts';
import type { CatalogState } from '../ui/state/dispatchCatalog';

test('recorded dispatch chips retain models and tiers across record kinds', async () => {
  // Regression: unknown recorded models and recorded service tiers disappeared from task chips.
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
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const summary = { model: 'opaque-id', effort: 'high', serviceTier: 'priority' };
    const records = [
      { kind: 'session', value: { id: 'task', dispatchSummary: summary } },
      { kind: 'timeline', taskId: 'task', turnId: 'turn', value: { turnDispatchSummaries: { turn: summary } } },
      { kind: 'task', value: { agent: 'codex', taskId: 'task', task: { ...summary, dispatch: { serviceTier: summary.serviceTier } } } },
    ];
    for (const record of records) {
      for (const resolver of [{ status: 'loading' }, { status: 'error' }, { status: 'ready', catalog: { authoritative: true, models: [] } }] as CatalogState[]) {
        await act(() => root.render(h(TooltipProvider, null, h(DispatchSpec, { agent: 'codex', record, resolver }))));
        assert.ok(mount.textContent?.trim());
        assert.ok(within(mount).getByLabelText(label => label.includes(summary.model) && label.includes(t('activity.fast'))));
      }
      for (const metadata of [{ displayName: 'Native model' }, { name: 'Native model' }]) {
        await act(() => root.render(h(TooltipProvider, null, h(DispatchSpec, { agent: 'codex', record,
          resolver: { status: 'ready', catalog: { models: [{ model: summary.model, ...metadata }] } } }))));
        const chip = within(mount).getByLabelText(label => label.includes(metadata.displayName ?? metadata.name!));
        assert.ok(chip.textContent?.includes(metadata.displayName ?? metadata.name!));
        assert.ok(!chip.getAttribute('aria-label')?.includes(summary.model));
        assert.ok(chip.textContent?.includes(t('activity.fast')));
      }
    }
    await act(() => root.render(h(TooltipProvider, null, h(DispatchSpec, { agent: 'codex',
      record: { kind: 'session', value: { id: 'task', dispatchSummary: { model: summary.model } } }, resolver: { status: 'error' } }))));
    assert.ok(within(mount).getByLabelText(summary.model));
  } finally {
    await act(() => root.unmount()); await server.close(); await window.happyDOM.close();
  }
});

test('task rows expose the recorded model and effort through the shared dispatch chip', async () => {
  // Regression: tasks-dispatch-dsh rows omitted the model and Max chip present in task detail.
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
  const root = createRoot(mount), originalFetch = globalThis.fetch;
  try {
    const { TaskRow } = await server.ssrLoadModule('/ui/components/objects/task/Row.tsx');
    const { TooltipProvider } = await server.ssrLoadModule('/ui/components/ui/index.tsx');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const catalog = { models: [{ model: 'opaque-task-model', displayName: 'Native task model' }] };
    const { model } = catalog.models[0], name = catalog.models[0].displayName;
    const record = { agent: 'dsh', taskId: 'recorded-task', requestId: 'request', state: 'completed',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', approval: { decision: 'automatic', source: 'remote', at: '' },
      task: { kind: 'create', title: 'Recorded task', prompt: 'Review configuration', input: [], model, effort: 'max', settings: { serviceTier: 'priority' } } };
    globalThis.fetch = async () => new Response(JSON.stringify(catalog));
    await act(() => root.render(h(TooltipProvider, null, h(TaskRow, { kind: "receipt", record, records: [record], id: record.taskId, onOpen() {} }))));
    const row = within(document.body).getByRole('button', { name: record.task.title });
    const chip = within(row).getByLabelText(label => label.includes(name));
    assert.ok(chip.textContent?.includes(name));
    assert.ok(chip.textContent?.includes(t('dispatchSpec.effort.max')));
    assert.ok(!chip.getAttribute('aria-label')!.includes(model));
    assert.ok(!chip.getAttribute('aria-label')!.includes(t('activity.fast')));
    await act(() => root.render(h(TooltipProvider, null, h(TaskRow, { kind: 'receipt', records: [record], id: record.taskId, record: { ...record, task: { ...record.task, dispatch: { serviceTier: 'priority' } } }, onOpen() {} }))));
    assert.ok(within(row).getByLabelText(label => label.includes(name) && label.includes(t('activity.fast'))));
  } finally {
    await act(() => root.unmount());
    globalThis.fetch = originalFetch;
    await server.close();
    await window.happyDOM.close();
  }
});


test('catalog labels preserve opaque identities and native text without inference', () => {
  // Property: labels match exact identities and never parse or rewrite recorded IDs or native names.
  const ids = ['["provider", "model"]', 'provider/model', ' GPT-6-Astra ', 'opaque · suffix'];
  for (const model of ids) {
    assert.equal(modelLabel(model, [{ model, name: 'Native name' }]), 'Native name');
    assert.equal(modelLabel(model, []), model);
    assert.equal(modelLabel(model, [{ model: `${model}x`, displayName: 'Different identity' }]), model);
    for (const displayName of ['GPT-6-Astra', 'DeepSeek V4 · native suffix', 'Provider/model-name']) {
      assert.equal(modelLabel(model, [{ model, displayName }]), displayName);
    }
  }
  assert.equal(modelLabel('["p", "m"]', [{ model: '["p","m"]', displayName: 'Other identity' }]), '["p", "m"]');
});

test('native provider names disambiguate equal display names', () => {
  // Regression: model labels parsed provider suffixes instead of using native provider metadata.
  const models = [
    { model: 'opaque-1', displayName: 'Shared', provider: { id: 'one', name: 'First provider' } },
    { model: 'opaque-2', displayName: 'Shared', provider: { id: 'two', name: 'Second provider' } },
    { model: 'opaque-3', displayName: 'Unique', provider: { id: 'one', name: 'First provider' } },
  ];
  assert.equal(modelLabel(models[0].model, models), `${models[0].displayName} · ${models[0].provider.name}`);
  assert.equal(modelLabel(models[2].model, models), models[2].displayName);
});
