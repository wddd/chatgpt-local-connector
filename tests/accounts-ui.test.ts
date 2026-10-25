import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { within } from '@testing-library/dom';

test('account UI uses native routes, login evidence and notification targets', async () => {
  // Regression: the account UI used invented detail/polling/notification routes and treated unsupported native login as successful.
  const window = new Window({ url: 'http://localhost/?scenario=accounts' });
  const media = Object.assign(new window.EventTarget(), { matches: true });
  window.matchMedia = () => media as unknown as MediaQueryList;
  class Observer { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { window, document: window.document, location: window.location, HTMLElement: window.HTMLElement, Element: window.Element,
    Node: window.Node, NodeFilter: window.NodeFilter, DocumentFragment: window.DocumentFragment, MutationObserver: window.MutationObserver,
    HTMLInputElement: window.HTMLInputElement, HTMLFormElement: window.HTMLFormElement, Event: window.Event, CustomEvent: window.CustomEvent, CSS: window.CSS,
    localStorage: window.localStorage, ResizeObserver: Observer, matchMedia: window.matchMedia, getComputedStyle: window.getComputedStyle.bind(window),
    innerWidth: 1280, innerHeight: 800, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Account scenario contacted real Core'); };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
  const { createRoot } = await import('react-dom/client');
  const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
  try {
    const { installScenario } = await server.ssrLoadModule('/ui/scenarios.ts');
    await installScenario('accounts');
    const { api, accountsApi } = await server.ssrLoadModule('/ui/api.ts');
    const list = await accountsApi.list();
    assert.equal(list.login, null);
    assert.ok(list.accounts.every((a: Record<string, unknown>) => !('email' in a) && !('orgName' in a)));
    assert.equal((await accountsApi.get('account-claude')).email, 'alex@example.com');
    assert.equal((await accountsApi.get('account-source')).alias, 'Unidentified');
    assert.deepEqual((await accountsApi.get('account-source')).agentProfiles, []);
    assert.equal((await accountsApi.query({ id: 'account-claude' })).id, 'account-claude');
    await accountsApi.update({ id: 'account-claude', alias: 'Example team' });
    assert.equal((await accountsApi.get('account-claude')).alias, 'Example team');
    await accountsApi.update({ id: 'account-review', defaultFor: 'claude' });
    assert.equal((await accountsApi.list()).accounts.flatMap((a: any) => a.agentProfiles).filter((p: any) => p.agent === 'claude' && p.default).length, 1);

    const claude = await accountsApi.reauth({ id: 'account-review', agent: 'claude' });
    assert.deepEqual(await accountsApi.login({ loginId: claude.loginId, action: 'code', code: 'example-code' }), { submitted: true });
    assert.equal((await accountsApi.list()).login.state, 'completed');
    assert.equal((await accountsApi.get('account-review')).agentProfiles[0].state, 'signed-in');
    await accountsApi.route({ accountId: 'account-review', target: 'session_010000000000000000000002' });
    await accountsApi.notify('account-review', 'test', { target: 'session_010000000000000000000002' });
    const notified = await accountsApi.get('account-review');
    assert.equal(notified.notifications.sessions[0].target, 'session_010000000000000000000002');
    assert.equal(notified.notifications.sessions[0].lastDelivery.status, 'sent');
    assert.equal(notified.notifications.state, 'not-bound');
    assert.equal(notified.notifications.reachable, false);
    await assert.rejects(accountsApi.notify('account-source', 'test', { target: 'session_010000000000000000000002' }), /ACCOUNT_AGENT_MISSING/);

    const codex = await accountsApi.add({ kind: 'codex' });
    await assert.rejects(accountsApi.login({ loginId: codex.loginId, action: 'code', code: 'example-code' }), /ACCOUNT_LOGIN_CODE_UNSUPPORTED/);
    const { default: AddAccount } = await server.ssrLoadModule('/ui/components/AddAccount.tsx');
    const { TooltipProvider } = await server.ssrLoadModule('/ui/components/ui/index.tsx');
    const { t } = await server.ssrLoadModule('/ui/i18n.ts');
    const page = within(document.body);
    await act(async () => root.render(h(TooltipProvider, null, h(AddAccount, { initialLogin: codex, onClose() {} }))));
    assert.equal(page.queryByText(t('claudeAccounts.enterCode')), null);
    assert.equal(page.queryByRole('button', { name: t('accounts.confirm'), exact: true }), null);
    await act(async () => root.render(null));
    for (let i = 0; i < 4; i++) await accountsApi.list();
    assert.equal((await accountsApi.list()).login.accountId, 'account-openai');

    const key = await accountsApi.add({ kind: 'api-key' });
    assert.equal(key.state, 'unfinished');
    assert.ok(key.next.message);
    await act(async () => root.render(h(TooltipProvider, null, h(AddAccount, { initialLogin: key, onClose() {} }))));
    assert.ok(page.getByText(key.next.message));
    assert.equal(page.queryByText(t('claudeAccounts.enterCode')), null);
    assert.equal(page.queryByRole('button', { name: t('accounts.confirm'), exact: true }), null);
    assert.ok(page.getByRole('button', { name: t('accounts.kind.detect'), exact: true }));
    await act(async () => root.render(null));
    for (let i = 0; i < 5; i++) assert.equal((await accountsApi.list()).login.state, 'unfinished');
    assert.equal((await accountsApi.get('account-key')).agentProfiles[0].state, 'unfinished');
    const detected = await accountsApi.add({ kind: 'detect' });
    assert.equal(detected.state, 'completed');
    assert.equal(detected.accountId, undefined);
    await act(async () => root.render(h(TooltipProvider, null, h(AddAccount, { initialLogin: detected, onClose() {} }))));
    assert.equal(page.queryByRole('button', { name: t('accounts.confirm'), exact: true }), null);
    await act(async () => root.render(null));

    const removed = await accountsApi.remove({ id: 'account-review', running: 'finish' });
    assert.equal(removed.health.state, 'removed');
    assert.equal((await accountsApi.get(removed.id)).displayName, 'Removed account · Review');
    assert.ok(!(await accountsApi.list()).accounts.some((a: any) => a.id === removed.id));
    await assert.rejects(api('accounts/login?loginId=example', 'GET'), /SCENARIO_ACTION_UNAVAILABLE/);
    await assert.rejects(api('accounts/bind', 'POST', { id: 'account-claude', target: 'example' }), /SCENARIO_ACTION_UNAVAILABLE/);
  } finally {
    await act(async () => root.unmount());
    await server.close(); globalThis.fetch = originalFetch; await window.happyDOM.abort();
  }
});
