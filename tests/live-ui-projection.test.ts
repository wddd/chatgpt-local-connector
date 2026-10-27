import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { within } from '@testing-library/dom';

async function renderer(run: (server: Awaited<ReturnType<typeof createServer>>, render: (element: any) => Promise<void>) => Promise<void>) {
  const window = new Window({ url: 'http://localhost' });
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, DocumentFragment: window.DocumentFragment, MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent, localStorage: window.localStorage, ResizeObserver: Observer, IntersectionObserver: Observer,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0),
    cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('div'); document.body.append(mount);
  const root = createRoot(mount), originalFetch = globalThis.fetch;
  try {
    const { TooltipProvider } = await server.ssrLoadModule('/ui/components/ui/index.tsx');
    await run(server, async element => { await act(async () => root.render(h(TooltipProvider, null, element))); });
  } finally {
    await act(() => root.unmount());
    globalThis.fetch = originalFetch;
    await server.close();
    await window.happyDOM.close();
  }
}

test('Claude accounts show native conversations owned by their transcript roots', async () => {
  // Regression: native agentAccountId was dropped by conversation projection, leaving Claude account lists empty.
  await renderer(async (server, render) => {
    const { default: Conversations } = await server.ssrLoadModule('/ui/components/AgentConversations.tsx');
    const { agentActivity } = await server.ssrLoadModule('/ui/state/activity.ts');
    const { trackedActivity } = await server.ssrLoadModule('/ui/state/activityBubbles.ts');
    const data = [
      { id: 'native-a', source: 'native', agentAccountId: 'old-a', title: 'Root A conversation', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'native-b', source: 'native', agentAccountId: 'account-b', title: 'Root B conversation', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'task-a', source: 'arc-task', dispatchSummary: { agentAccountId: 'account-a' }, title: 'Dispatched conversation', createdAt: '2026-01-01T00:00:00Z' },
    ];
    globalThis.fetch = async () => new Response(JSON.stringify({ data, nextCursor: null, scope: 'native-unarchived' }));
    agentActivity.set({ error: '', snapshot: { agents: {}, activeAgents: [], observedAt: '' } });
    trackedActivity.set({});
    const page = within(document.body);
    await render(h(Conversations, { key: 'a', agent: 'claude', accountId: 'account-a', account: { id: 'account-a', mergedAccountIds: ['old-a'] }, active: true }));
    assert.ok(page.getByRole('button', { name: name => name.includes(data[0].title) }));
    assert.ok(page.getByRole('button', { name: name => name.includes(data[2].title) }));
    assert.equal(page.queryByRole('button', { name: name => name.includes(data[1].title) }), null);
    await render(h(Conversations, { key: 'b', agent: 'claude', accountId: 'account-b', account: { id: 'account-b' }, active: true }));
    assert.ok(page.getByRole('button', { name: name => name.includes(data[1].title) }));
    assert.equal(page.queryByRole('button', { name: name => name.includes(data[0].title) }), null);
  });
});

test('external task detail keeps matching-turn dispatch evidence after history loads', async () => {
  // Regression: external Claude detail replaced an activity model with missing-spec when timeline metadata was absent.
  await renderer(async (server, render) => {
    const { TaskCard } = await server.ssrLoadModule('/ui/components/objects/task/Card.tsx');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ model: 'executed-model', displayName: 'Executed model' }] }));
    const session = { id: 'external', source: 'transcript', turnId: 'current', dispatchSummary: { model: 'executed-model', effort: 'high' } };
    const task = { kind: 'timeline', session, turnId: 'current', running: true, hasPending: false };
    const timeline = { sessionId: session.id, entries: [], coverage: { state: 'complete' } };
    const page = within(document.body);
    await render(h(TaskCard, { agent: 'claude', task }));
    assert.ok(page.getByLabelText(label => label.includes('Executed model')));
    await render(h(TaskCard, { agent: 'claude', task: { ...task, timeline } }));
    assert.ok(page.getByLabelText(label => label.includes('Executed model')));
    assert.equal(page.queryByLabelText(t('dispatchSpec.missing')), null);
    await render(h(TaskCard, { agent: 'claude', task: { ...task, turnId: 'older', timeline } }));
    assert.ok(page.getByLabelText(t('dispatchSpec.missing')));
    await render(h(TaskCard, { agent: 'claude', task: { ...task, timeline: { ...timeline, turnDispatchSummaries: { current: { model: 'recorded-model', effort: 'low' } } } } }));
    assert.ok(page.getByLabelText(label => label.includes('recorded-model')));
  });
});
