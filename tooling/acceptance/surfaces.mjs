import { srcConversationsScenario } from '../../ui/scenarioSrcConversations.ts';

// ARC composition checks. Radix owns generic control semantics and keyboard behavior.
export async function acceptLayout(page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
    const visible = node => node.checkVisibility({ visibilityProperty: true }) && !node.closest('[hidden],[inert]');
    const roots = [...document.querySelectorAll('main,.workspace,.dialog-body,.side-panel-scroll,.page-sheet-content,[role="dialog"]')].filter(visible);
    const box = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label') ?? node.tagName, x, y, width, height }; };
    const dock = document.querySelector('.navigation-capsule');
    const core = document.querySelector('.connection-core');
    // Regression: the fixed dock covered homepage cards and the expanded queue at 640px.
    const dockOverlap = dock && core && visible(dock) && visible(core)
      && core.getBoundingClientRect().bottom > dock.getBoundingClientRect().top;
    return {
      dockOverlap,
      // Regression: hidden choice measurements and setup instruction tracks widened their hosts.
      overflow: roots.filter(node => node.clientWidth && node.scrollWidth > node.clientWidth + 1).map(box),
      bounds: [...document.querySelectorAll('.page-sheet,[role="dialog"],.connection-core')].filter(visible).map(box),
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  const viewport = page.viewportSize();
  if (geometry.documentOverflow || geometry.overflow.length || geometry.dockOverlap) throw new Error(`Surface overflow: ${JSON.stringify(geometry)}`);
  for (const box of geometry.bounds) {
    if (box.width <= 0 || box.height <= 0 || box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) throw new Error(`Surface outside viewport: ${JSON.stringify(box)}`);
  }
  return geometry;
}

export async function restoredFocus(page, trigger) {
  await page.waitForFunction(element => document.activeElement === element, await trigger.elementHandle(), { timeout: 2000 });
}

async function absent(scope, messages, keys) {
  for (const key of keys) {
    if (!messages[key]) throw new Error(`Unknown surface entry: ${key}`);
    if (await scope.getByRole('button', { name: messages[key], exact: true }).count()) throw new Error(`Forbidden surface entry: ${key}`);
  }
}

export async function acceptSurface(page, fixture, name, messages) {
  const button = (scope, key) => scope.getByRole('button', { name: messages[key], exact: true });
  if (name === 'homepage-empty' || name === 'homepage-sources-agents') {
    const nav = page.getByRole('navigation', { name: messages.mainNavigation, exact: true });
    const names = await nav.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    if (JSON.stringify(names) !== JSON.stringify([messages.logs, messages['source.connections'], messages.settings])) throw new Error('Dock must contain Logs, Connections, Settings in order');
    for (const [key, destination] of [['logs', 'logs'], ['source.connections', 'connections'], ['settings', 'settings']]) {
      const trigger = button(nav, key);
      await trigger.click();
      await page.waitForFunction(destination => window.__ARC_VIEW_MODEL__().panels.page === destination, destination);
      await acceptLayout(page);
      await page.keyboard.press('Escape');
      await nav.waitFor({ state: 'visible' });
      await restoredFocus(page, trigger);
    }
    for (const key of ['addControlSource', fixture.agents.length ? 'manageAgents' : 'addAgent']) {
      const trigger = button(page, key);
      await trigger.click();
      await page.getByRole('dialog').waitFor();
      await acceptLayout(page);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await restoredFocus(page, trigger);
    }
  }
  if (fixture.sourceSetup && fixture.sourceSetup.step !== 'welcome') {
    const dialog = page.getByRole('dialog');
    await absent(dialog, messages, ['setup.invite', 'hosting.copyInvite', 'accounts.merge']);
    const step = fixture.sourceSetup.step;
    // Remote and local paths each expose their one prescribed configuration method.
    if (step === 'product') {
      const next = button(dialog, 'source.next');
      if (await next.isEnabled() !== !!fixture.sourceSetup.source) throw new Error('Product selection did not gate the next step');
      if (fixture.sourceSetup.source) { await next.click(); await dialog.getByRole('textbox', { name: messages['source.copyAddress'], exact: true }).waitFor(); }
    } else if (step === 'address') {
      if (fixture.remoteLink?.empty) await button(dialog, fixture.sourceSetup.deploying ? 'cancel' : 'source.createRelay').waitFor();
      else await dialog.getByRole('textbox', { name: messages[fixture.remoteLink?.local ? 'connections.localCommand' : 'source.copyAddress'], exact: true }).waitFor();
      if (fixture.remoteLink?.local) {
        const command = await dialog.getByRole('textbox', { name: messages['connections.localCommand'], exact: true }).inputValue();
        const target = fixture.sourceSetup.source === 'local-desktop' ? 'desktop' : 'code';
        if (!command.includes(JSON.stringify({ body: { target } }))) throw new Error('Local setup command targets the wrong client');
      }
      if (await dialog.getByRole('combobox').count() || await dialog.getByRole('radiogroup').count()) throw new Error('Configure step exposes a connection selector');
    } else if (step === 'approval') {
      await button(dialog, 'oauthAllow').waitFor(); await button(dialog, 'oauthDeny').waitFor();
      await dialog.getByText('4F7K', { exact: true }).waitFor();
    } else if (step === 'success') await button(dialog, 'source.done').waitFor();
  }
  if (fixture.page === 'connections') {
    const main = page.getByRole('main');
    await main.getByText(messages['source.kind.local'], { exact: true }).waitFor();
    await button(main, 'connections.otherMethods').waitFor();
    await absent(main, messages, ['remove', 'hosting.copyInvite', 'setup.invite']);
    for (const [kind, label] of [['local', messages['source.kind.local']], ['extra', 'CLI proxy']]) {
      const state = fixture.remoteLink?.[`${kind}State`];
      if (!state) continue;
      const entry = main.locator('.entity-row').filter({ hasText: label });
      await entry.getByText(messages[state === 'error' ? 'connectionError' : 'disconnected'], { exact: true }).waitFor();
      if (await entry.getByRole('button').count()) throw new Error(`${kind} connection exposes an action in ${state} state`);
    }
    if (fixture.connectionDeployment) {
      await main.getByRole('textbox', { name: messages['connect.copyLogin'], exact: true }).waitFor();
      await button(main, 'cancel').click();
      await button(main, 'source.createRelay').waitFor();
      if (await main.getByRole('textbox', { name: messages['connect.copyLogin'], exact: true }).count()) throw new Error('Cancelled deployment did not return to Connections');
    } else if (fixture.remoteLink?.empty) await button(main, 'source.createRelay').waitFor();
    else {
      await main.getByRole('heading', { name: messages['connections.publicLink'], exact: true }).waitFor();
      await main.getByRole('textbox', { name: messages['source.copyAddress'], exact: true }).waitFor();
      await main.getByText('CLI proxy', { exact: false }).waitFor();
      // Exactly the public link has a start/stop action; CLI-configured rows are read-only.
      if (await main.getByRole('button', { name: new RegExp(`^(${messages.start}|${messages.stop})$`) }).count() !== 1) throw new Error('Additional connections expose lifecycle controls');
      const action = fixture.remoteLink?.stopped ? 'start' : 'stop';
      await button(main, action).click();
      await button(main, action === 'start' ? 'stop' : 'start').waitFor();
    }
  }
  if (fixture.panelAccounts && fixture.detailTask === undefined && fixture.panel) {
    const panel = page.getByRole('dialog');
    await absent(panel, messages, ['accounts.merge', 'accounts.notifications', 'hosting.copyInvite']);
    const rename = button(panel, 'panels.rename');
    if (await rename.isVisible()) {
      // ARC owns the stacked account editor and the parent's drill-down Escape behavior.
      await rename.click();
      const editor = page.getByRole('dialog', { name: messages['panels.rename'], exact: true });
      await editor.getByRole('textbox', { name: messages['accounts.alias'], exact: true }).waitFor();
      await acceptLayout(page);
      await page.keyboard.press('Escape');
      await editor.waitFor({ state: 'hidden' });
      await restoredFocus(page, rename);
      await rename.waitFor();
      const remove = button(panel, 'remove');
      await remove.click();
      const confirmation = page.getByRole('dialog').filter({ has: page.getByText(messages['accounts.removeConsequence'], { exact: true }) });
      await confirmation.waitFor();
      await acceptLayout(page);
      await button(confirmation, 'cancel').click();
      await confirmation.waitFor({ state: 'hidden' });
      await restoredFocus(page, remove);
      if (name.endsWith('l2-empty')) await panel.getByText(messages[fixture.panel.kind === 'source' ? 'panels.noConversations' : 'agentPanel.noConversations'], { exact: true }).waitFor();
      if (name === 'src-l2' || name === 'src-l2-dark') {
        // Regression: SRC conversation and related-task rows exposed UUIDs and task IDs as titles.
        const conversations = srcConversationsScenario()('src-conversations/query', 'POST', { accountId: fixture.panel.accountId }).accounts[0].conversations;
        const multiple = conversations.find(row => row.taskRefs.length > 1);
        await panel.getByRole('button', { name: multiple.title, exact: true }).click();
        for (const reference of multiple.taskRefs) {
          const task = fixture.tasks[Number(reference.id.split('-').at(-1))];
          await panel.getByRole('button', { name: task.title, exact: true }).waitFor();
        }
        const text = await panel.innerText();
        for (const conversation of conversations) {
          for (const id of [conversation.id, ...conversation.taskRefs.map(task => task.id)]) {
            if (text.includes(id)) throw new Error(`Conversation row exposes internal ID: ${id}`);
          }
        }
        await panel.getByRole('button', { name: conversations[0].title, exact: false }).click();
        await page.waitForFunction(() => !!window.__ARC_VIEW_MODEL__().panels.agent?.session);
        await acceptTaskNavigation(page, fixture, messages);
      } else if (name === 'agent-l2') {
        const task = panel.getByRole('button', { name: new RegExp(`^${fixture.tasks[2].title} ·`) });
        await task.click();
        await acceptTaskNavigation(page, fixture, messages);
      }
    } else if (name === 'src-l1') {
      await button(panel, 'accounts.add').click();
      const next = page.getByRole('dialog').getByRole('button', { name: messages['source.next'], exact: true });
      await next.waitFor();
      if (!await next.isEnabled()) throw new Error('SRC Add account lost its preselected product');
    } else if (name === 'agent-l1') {
      await button(panel, 'accounts.add').click();
      await page.getByRole('button', { name: messages['claudeAccounts.enterCode'], exact: true }).waitFor();
    }
  }
  if (name === 'src-l1-empty') {
    const panel = page.getByRole('dialog', { name: messages['setup.otherClient'], exact: true });
    await panel.waitFor();
    if (/\bCustom\b/.test(await panel.innerText())) throw new Error('SRC title exposes the registry name');
  }
  if (fixture.pageFixture === 'add-account' && /\baccount_add\b/.test(await page.getByRole('dialog').innerText())) throw new Error('Account login exposes an internal op');
  if (name === 'task-bubbles-standard') {
    const bubble = page.getByRole('button').filter({ has: page.getByText(fixture.tasks[0].title, { exact: true }) });
    await bubble.click();
    await acceptLayout(page);
    await acceptTaskNavigation(page, fixture, messages);
  }
  if (fixture.page === 'logs') {
    const main = page.getByRole('main');
    if (fixture.logsEmpty) await main.getByText(messages.noConnectionRecordsYet, { exact: true }).waitFor();
    else {
      for (const key of ['time', 'recordSource', 'recordOperation', 'recordResult']) await main.getByRole('columnheader', { name: messages[key], exact: true }).waitFor();
      // Regression: the first disclosure was a warning, but the assertion waited for a different error's copy.
      const records = fixture.logs.filter(record => record.reason || record.error).toReversed();
      const details = button(main, 'details');
      for (const [index, record] of records.entries()) {
        const trigger = details.nth(index);
        await trigger.click();
        if (await trigger.getAttribute('aria-expanded') !== 'true') throw new Error('Log details did not expand');
        const content = page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
        await content.getByText(String(record.reason ?? record.error), { exact: false }).waitFor();
        await trigger.click();
        await content.waitFor({ state: 'hidden' });
      }
    }
  }
}

export async function acceptTaskNavigation(page, fixture, messages) {
  const panel = page.getByRole('dialog');
  await page.waitForFunction(() => !!window.__ARC_VIEW_MODEL__().panels.agent?.session);
  // L3 returns through its owning account when known; unknown ownership stays on L1.
  const hasAccount = await page.evaluate(() => !!window.__ARC_VIEW_MODEL__().panels.agent?.accountId);
  await page.keyboard.press('Escape');
  if (hasAccount) {
    await panel.getByRole('button', { name: messages['panels.rename'], exact: true }).waitFor();
    await page.keyboard.press('Escape');
  }
  await panel.getByRole('button', { name: messages['accounts.add'], exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
}
