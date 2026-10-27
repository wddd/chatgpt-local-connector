import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h, useLayoutEffect } from 'react';
import { within } from '@testing-library/dom';
import { shortenModelLabel } from '../ui/components/composites/dispatchSpecLabel.ts';
import type { CatalogState } from '../ui/state/dispatchCatalog';

test('recorded dispatch specs expose readable catalog labels on focus and identify unresolved models', async () => {
  // Regression: resolved dsh IDs leaked into labels; absent Claude models left separators and default-tier labels.
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
  const originalFetch = globalThis.fetch;
  try {
    const { DispatchSpec } = await server.ssrLoadModule('/ui/components/composites/DispatchSpec.tsx');
    const { TooltipProvider } = await server.ssrLoadModule('/ui/components/ui/index.tsx');
    const { dispatchCatalogFixtures } = await server.ssrLoadModule('/ui/scenarioDispatchSpec.ts');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const catalog = dispatchCatalogFixtures.dsh;
    const { model } = catalog.models[0], name = shortenModelLabel(catalog.models[0].name);
    const summary = { model, effort: 'max', serviceTier: 'priority' };
    const records = [
      { kind: 'session', value: { id: 'dsh-task', source: 'arc-task', dispatchSummary: summary } },
      { kind: 'timeline', taskId: 'dsh-task', turnId: 'turn', value: { turnDispatchSummaries: { turn: summary } } },
      { kind: 'task', value: { agent: 'dsh', taskId: 'dsh-task', requestId: 'request', task: summary } },
    ];
    const page = within(document.body);
    const render = async (record: unknown, resolver: CatalogState = { status: 'ready', catalog }, variant: 'panel' | 'inline' = 'panel') => {
      await act(() => root.render(h(TooltipProvider, null, h(DispatchSpec, {
        agent: 'dsh', record, resolver, variant,
      }))));
    };
    for (const record of records) {
      await render(record, { status: 'loading' });
      const loading = page.getByLabelText((label) => label.includes(t('dispatchSpec.loading')));
      assert.equal(loading.getAttribute('aria-busy'), 'true');
      assert.ok(!loading.textContent?.includes(model));
      assert.ok(!loading.getAttribute('aria-label')!.includes(model));
      assert.ok(loading.textContent?.includes(t('dispatchSpec.effort.max')));
      if (record.kind !== 'task') assert.ok(loading.textContent?.includes(t('activity.fast')));
      await act(() => loading.focus());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.ok(!page.getByRole('tooltip').textContent?.includes(model));
      await act(() => loading.blur());
      await render(record);
      const chip = page.getByLabelText((label) => label.includes(name));
      assert.ok(!chip.getAttribute('aria-label')!.includes(model));
      await act(() => chip.focus());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      const tooltip = page.getByRole('tooltip');
      assert.ok(tooltip.textContent?.includes(name));
      assert.ok(!tooltip.textContent?.includes(model));
      await act(() => chip.blur());
      await render(record, { status: 'loading', catalog });
      assert.ok(page.getByLabelText((label) => label.includes(name)).textContent?.includes(name));
    }
    await render(records[0], { status: 'ready', catalog: { models: [] } });
    const unresolved = page.getByLabelText((label) => label.includes(model));
    assert.ok(unresolved.getAttribute('aria-label')!.includes(t('dispatchSpec.unresolved')));
    await act(() => unresolved.focus());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const tooltip = page.getByRole('tooltip');
    assert.ok(tooltip.textContent?.includes(model));
    assert.ok(tooltip.textContent?.includes(t('dispatchSpec.unresolved')));
    await act(() => unresolved.blur());
    await render(records[0], { status: 'error' });
    const failed = page.getByLabelText((label) => label.includes(model));
    assert.ok(failed.getAttribute('aria-label')!.includes(t('dispatchSpec.unresolved')));
    assert.ok(failed.getAttribute('aria-label')!.includes(t('dispatchSpec.error')));
    for (const variant of ['panel', 'inline'] as const) {
      const record = { kind: 'session', value: { id: 'no-model', source: 'arc-task', dispatchSummary: { effort: 'high', serviceTier: 'default' } } };
      await render(record, { status: 'error' }, variant);
      const effort = page.getByLabelText(t('dispatchSpec.effort.high'), { exact: true });
      assert.ok(!effort.textContent?.includes('·'));
      assert.ok(!effort.textContent?.includes(t('dispatchSpec.standard')));
      assert.ok(!effort.textContent?.includes(t('dispatchSpec.unresolved')));
      await render({ ...record, value: { ...record.value, dispatchSummary: { effort: 'high', serviceTier: 'priority' } } }, { status: 'ready' }, variant);
      const fast = page.getByLabelText(label => label.includes(t('activity.fast')));
      assert.equal(fast.getAttribute('aria-label')?.split(' · ').length, 2);
      assert.ok(!fast.textContent?.trim().startsWith('·'));
      assert.ok(!fast.textContent?.trim().endsWith('·'));
    }
    let complete!: (response: Response) => void;
    globalThis.fetch = () => new Promise<Response>(resolve => { complete = resolve; });
    let firstFrame: { text: string | null; label: string | null } | undefined;
    function NativeChip() {
      useLayoutEffect(() => {
        const chip = page.getByLabelText(label => label.includes(t('dispatchSpec.effort.max')));
        firstFrame = { text: chip.textContent, label: chip.getAttribute('aria-label') };
      }, []);
      return h(DispatchSpec, { agent: 'dsh', record: records[0] });
    }
    await act(() => root.render(h(TooltipProvider, null, h(NativeChip))));
    assert.ok(firstFrame?.text?.includes(t('dispatchSpec.loading')));
    assert.ok(!firstFrame?.text?.includes(model));
    assert.ok(!firstFrame?.label?.includes(model));
    assert.equal(page.getByLabelText(label => label.includes(t('dispatchSpec.loading'))).getAttribute('aria-busy'), 'true');
    await act(async () => complete(new Response(JSON.stringify(catalog))));
    assert.ok(page.getByLabelText(label => label.includes(name)));
  } finally {
    await act(() => root.unmount());
    globalThis.fetch = originalFetch;
    await server.close();
    await window.happyDOM.close();
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
    const { dispatchCatalogFixtures } = await server.ssrLoadModule('/ui/scenarioDispatchSpec.ts');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const catalog = dispatchCatalogFixtures.dsh, { model } = catalog.models[0], name = shortenModelLabel(catalog.models[0].name);
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


test('model label shortening preserves unmatched names and native version text', () => {
  // Property: only complete recognized leading brands are removed; other names remain unchanged.
  for (const [name, expected] of [
    ['GPT-6-Astra', '6 Astra'], ['GPT-6.1-Sol', '6.1 Sol'],
    ['Claude Opus 5.5', 'Opus 5.5'], ['DeepSeek V4.1 Flash · OpenCode Go', 'V4.1 Flash · OpenCode Go'],
    ['claude-Sonnet-5.2', 'Sonnet 5.2'], ['OpenAI Research-Preview', 'Research Preview'],
    ['Unknown-model-v2', 'Unknown-model-v2'], ['My Claude model', 'My Claude model'],
    ['GPTish-6', 'GPTish-6'], ['Claude', 'Claude'], ['Claude-', 'Claude-'], ['GPT--', 'GPT--'], ['GPT  ', 'GPT  '], ['', ''],
  ]) assert.equal(shortenModelLabel(name), expected);
});
