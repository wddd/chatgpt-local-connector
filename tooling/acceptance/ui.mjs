import { acceptTopologyWires } from './topology-wires.mjs';
import { acceptAgentObjects } from './agent-objects.mjs';
import { acceptNodeBranding } from './node-branding.mjs';
import { acceptLongRequest, acceptRequests } from './requests.mjs';
import { acceptDispatchSpecBubbles } from './dispatch-spec.mjs';
import { acceptSettings } from './settings.mjs';
import { requireMainCheckout } from '../coding-lane.mjs';
requireMainCheckout();
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = path.join(root, 'output/acceptance/ui');
const screenshots = !process.argv.includes('--no-screenshots');
const scenarioFilter = process.argv.find(arg => arg.startsWith('--scenario='))?.slice('--scenario='.length);
const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice('--port='.length) ?? 5187);
const setupOnly = process.argv.includes('--setup-only');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
await mkdir(base, { recursive: true });
const previous = (await readdir(base)).filter(n => n.endsWith(`-${engine}`)).sort().at(-1);
const out = path.join(base, `${new Date().toISOString().replaceAll(':', '-')}-${engine}${screenshots ? '' : '-layout'}`);
await mkdir(out);
const scenarios = (await readdir(path.join(root, 'tooling/acceptance/scenarios'))).filter(f => f.endsWith('.json') && (!scenarioFilter || f === `${scenarioFilter}.json`)).sort();
if (!scenarios.length) throw new Error('No matching acceptance scenario');
const report = { engine, screenshots, previous: screenshots ? previous ?? null : null, viewports: [{ width: 640, height: 800 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }], scenarios: [], failures: [] };
// This server has no production owner dependency: fixture API calls are intercepted
// in the dev-only module, and the browser rejects every real management request.
const server = await createServer({ configFile: path.join(root, 'vite.config.ts'), mode: 'acceptance-fixture', server: { port, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await ({ chromium, webkit }[engine]).launch();
  for (const file of scenarios) {
    const fixture = JSON.parse(await readFile(path.join(root, 'tooling/acceptance/scenarios', file), 'utf8'));
    const setup = !!(fixture.sourceSetup && fixture.sourceSetup.step !== 'welcome' || fixture.connectionSetup);
    if (setupOnly && !setup) continue;
    const name = file.slice(0, -5);
    const longRequest = name === 'task-long-question' || name === 'task-long-approval';
    const outcome = name === 'task-turn-failed' || name === 'task-turn-interrupted';
    const viewports = longRequest || outcome || ['idle', 'light', 'dark'].includes(name) || name.startsWith('topology-accounts') ? [{ width: 360, height: 800 }, ...report.viewports] : report.viewports;
    for (const { width, height } of viewports) {
      const key = `${name}-${width}x${height}`;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
      // Stable elapsed labels across runs, while rAF and the renderer keep working.
      await page.addInitScript(() => { const original = Date; const fixed = original.parse('2026-01-01T00:00:00Z'); Date = class extends original { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }; });
      const row = { name, width, height, key, errors, baseline: screenshots ? 'missing' : 'disabled', changedPixels: null, changedRatio: null };
      try {
        await page.goto(`http://127.0.0.1:${port}/?scenario=${encodeURIComponent(name)}`);
        await page.waitForFunction(name => document.documentElement.dataset.scenarioError || document.documentElement.dataset.scenarioReady === name, name, { timeout: 15000 });
        const model = await page.evaluate(() => window.__ARC_VIEW_MODEL__());
        if (!model.scenario?.ready) throw new Error(model.scenario?.error || 'Fixture task detail is not ready');
        if (!fixture.page && !fixture.shells && !model.topology) throw new Error('No rendered topology exported');
        if (model.topology && !fixture.page && !fixture.shells) row.wires = await acceptTopologyWires(page);
        const actualAgents = (model.topology?.nodes ?? []).filter(n => n.side === 1).map(n => n.id);
        if (!fixture.page && !fixture.shells && fixture.agents.some(a => !actualAgents.includes(a))) throw new Error('Fixture agents were not rendered');
        const representedTasks = model.topology?.tasks.reduce((sum, task) => sum + (task.count ?? 1), 0);
        if (!fixture.page && !fixture.shells && !fixture.panel && representedTasks !== fixture.tasks.length) throw new Error(`Task count mismatch: ${representedTasks}/${fixture.tasks.length}`);
        if (fixture.panel?.kind === 'agent' && model.panels.agent?.agent !== fixture.panel.id) throw new Error('Agent panel not opened');
        if (fixture.panel?.kind === 'source' && model.panels.source !== fixture.panel.id) throw new Error('Source panel not opened');
        if (name.startsWith('agent-objects-')) await acceptAgentObjects(page);
        if (name.startsWith('requests-')) await acceptRequests(page);
        if (name.startsWith('topology-accounts')) {
          // Regression: PlatformIcon convergence shrank the unringed Agent parent and ringed account logos.
          const parent = page.getByRole('button', { name: 'Claude Code', exact: true });
          if (await parent.getByRole('img').count()) throw new Error('Agent parent must remain without quota for the logo fixture');
          for (const name of ['Personal', 'Studio']) {
            const account = page.getByRole('button', { name, exact: true }).filter({ has: page.getByRole('img') });
            if (await account.count() !== 1) throw new Error('Each Agent account must expose its quota ring in the logo fixture');
          }
        }
        if (name.startsWith('topology-accounts')) {
          const attributed = model.topology.tasks.find(task => task.taskId === 'fixture-task-0');
          const account = model.topology.nodes.find(node => node.side === 1 && node.accountId === 'example-personal');
          if (!account || attributed?.parent !== account.id) throw new Error('Claude task did not branch from its execution account');
          const unknown = model.topology.tasks.find(task => task.taskId === 'fixture-task-2');
          if (unknown?.parent !== 'claude') throw new Error('Unknown execution account was guessed');
          row.nodeBranding = await acceptNodeBranding(page);
          await page.getByLabel('Opus 5.5 · Medium', { exact: true }).waitFor({ state: 'visible' });
        }
        if (name.startsWith('bubbles-claude-spec')) {
          await acceptDispatchSpecBubbles(page, fixture);
        }
        if (name === 'agent-panel-unread') {
          // Regression: completed unread tasks were mixed into date groups instead of appearing between Running and Today.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const panel = page.getByRole('dialog', { name: 'Codex', exact: true });
          const unread = panel.getByRole('region', { name: messages['agentPanel.unread'], exact: true });
          const today = panel.getByRole('region', { name: messages['agentPanel.today'], exact: true });
          await unread.waitFor({ state: 'visible' });
          await today.waitFor({ state: 'visible' });
          const sections = await panel.getByRole('region').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
          const runningIndex = sections.indexOf(messages['agentPanel.running']);
          if (runningIndex < 0 || sections[runningIndex + 1] !== messages['agentPanel.unread'] || sections[runningIndex + 2] !== messages['agentPanel.today']) throw new Error('Unread is not between Running and Today');
          const completed = fixture.tasks.filter(task => task.completed);
          if (await unread.getByRole('button').count() !== completed.length) throw new Error('Unread group count does not match observed unread completions');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-unread.png`), animations: 'disabled' });
          for (const task of completed) {
            const name = new RegExp(`^${task.title} ·`);
            if (await today.getByRole('button', { name }).count()) throw new Error('Unread task is duplicated in Today');
            await unread.getByRole('button', { name }).click();
            await page.getByRole('button', { name: messages.back, exact: true }).click();
            await today.getByRole('button', { name }).waitFor({ state: 'visible' });
            await unread.getByRole('button', { name }).waitFor({ state: 'hidden' });
          }
          await unread.waitFor({ state: 'hidden' });
        }
        if (name === 'task-queue-overflow') {
          // Regression: overflow hid running tasks, and View all opened the Agent panel instead of temporarily revealing the queue.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const summary = page.getByRole('button', { name: new RegExp(`${messages['activity.viewAll']}$`) });
          const taskButton = task => page.getByRole('button', { name: new RegExp(`^${task.title} ·`) });
          for (const task of fixture.tasks.filter(task => !task.completed)) {
            if (!await taskButton(task).isVisible()) throw new Error('Overflow hid unfinished work behind completed tasks');
          }
          await summary.click();
          for (const task of fixture.tasks) await taskButton(task).waitFor({ state: 'visible' });
          const expanded = await page.evaluate(() => window.__ARC_VIEW_MODEL__());
          if (expanded.panels.agent || expanded.panels.source || await page.getByRole('dialog').count()) throw new Error('View all opened a detail panel');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-expanded.png`), animations: 'disabled' });
          await page.keyboard.press('Escape');
          await summary.waitFor({ state: 'visible' });
          await taskButton(fixture.tasks[1]).waitFor({ state: 'hidden' });
          if (!await summary.evaluate(element => element === document.activeElement)) throw new Error('Escape did not restore overflow trigger focus');
          await summary.press('Enter');
          for (const task of fixture.tasks) await taskButton(task).waitFor({ state: 'visible' });
          if (!await taskButton(fixture.tasks[1]).evaluate(element => element === document.activeElement)) throw new Error('Keyboard expansion did not focus a revealed task');
          await page.getByRole('main').click({ position: { x: 1, y: 1 } });
          await summary.waitFor({ state: 'visible' });
          await taskButton(fixture.tasks[1]).waitFor({ state: 'hidden' });
        }
        if (name.startsWith('debt-add-account-')) {
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const disclosure = page.getByRole('button', { name: messages['claudeAccounts.enterCode'], exact: true });
          await disclosure.press('Enter');
          const code = page.getByRole('textbox', { name: messages['claudeAccounts.code'], exact: true });
          await code.waitFor({ state: 'visible' });
          await page.getByRole('button', { name: messages.submit ?? 'submit', exact: true }).click();
          if (!await code.evaluate(element => element === document.activeElement && element.getAttribute('aria-invalid') === 'true')) throw new Error('Authorization-code validation did not focus its field');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-validation.png`), animations: 'disabled' });
          await code.fill('fixture-code');
          await page.getByRole('button', { name: messages.submit ?? 'submit', exact: true }).click();
          const alias = page.getByRole('textbox', { name: messages['accounts.alias'], exact: true });
          await alias.waitFor({ state: 'visible' });
          await alias.fill('');
          await page.getByRole('button', { name: messages['accounts.confirm'], exact: true }).click();
          if (!await alias.evaluate(element => element === document.activeElement && element.getAttribute('aria-invalid') === 'true')) throw new Error('Account alias validation did not focus its field');
          await alias.fill('Fixture account');
        }
        if (name.startsWith('debt-quota-segments-')) {
          const segment = page.getByRole('button', { name: 'Code · 40%', exact: true });
          await segment.focus();
          if (await segment.getAttribute('aria-expanded') !== 'true') await page.waitForFunction(() => document.activeElement?.getAttribute('aria-expanded') === 'true');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-segment.png`), animations: 'disabled' });
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const remaining = page.getByRole('button', { name: `${messages.usageRemaining} · 35%`, exact: true });
          await remaining.focus();
          await page.waitForFunction(() => document.activeElement?.getAttribute('aria-expanded') === 'true');
        }
        if (name.startsWith('debt-records-')) {
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const disclosure = page.getByRole('button', { name: messages.details, exact: true }).first();
          await disclosure.press('Enter');
          if (await disclosure.getAttribute('aria-expanded') !== 'true') throw new Error('Record details did not expand from the keyboard');
          await disclosure.press('Space');
          if (await disclosure.getAttribute('aria-expanded') !== 'false') throw new Error('Record details did not collapse from the keyboard');
          await disclosure.press('Enter');
        }
        let taskDetail;
        if (fixture.detailTask !== undefined) {
          const task = fixture.tasks[fixture.detailTask];
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const title = task.agent === 'codex' ? task.title : messages['timeline.title'];
          taskDetail = page.getByRole('dialog', { name: title, exact: true });
          // Semantic snapshots exclude aria-hidden Radix form inputs and visual announcement mirrors.
          row.taskAccessibility = await taskDetail.ariaSnapshot();
          if (longRequest) row.requestBody = await acceptLongRequest(page, taskDetail, messages);
        }
        if (outcome) {
          // Regression: dc01e93 replaced the 95d397e viewport reservation with scroll padding, covering outcome actions.
          await page.evaluate(() => document.fonts.ready);
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const action = taskDetail.getByRole('button', { name: messages[name === 'task-turn-failed' ? 'detail.retry' : 'detail.resumeInterrupted'], exact: true });
          const latest = taskDetail.getByRole('button', { name: messages['timeline.latest'], exact: true });
          const viewport = taskDetail.getByLabel(messages['timeline.title'], { exact: true });
          const assertActionExposed = async () => {
            const actionBox = await action.boundingBox(), viewportBox = await viewport.boundingBox();
            const latestBox = await latest.isVisible() ? await latest.boundingBox() : null;
            if (!actionBox || !viewportBox) throw new Error('The outcome action or timeline is missing');
            const visibleTop = Math.max(actionBox.y, viewportBox.y);
            const visibleBottom = Math.min(actionBox.y + actionBox.height, viewportBox.y + viewportBox.height);
            if (latestBox && visibleBottom > visibleTop && actionBox.x < latestBox.x + latestBox.width && actionBox.x + actionBox.width > latestBox.x && visibleTop < latestBox.y + latestBox.height && visibleBottom > latestBox.y) throw new Error('Back to latest overlaps the outcome action');
            for (const [control, box] of [[action, { ...actionBox, y: visibleTop, height: visibleBottom - visibleTop }], [latest, latestBox]]) {
              if (!box || box.height <= 0) continue;
              const exposed = await control.evaluate((element, box) =>
                [[.5, .5], [.15, .15], [.85, .15], [.15, .85], [.85, .85]].every(([x, y]) =>
                  element.contains(document.elementFromPoint(box.x + box.width * x, box.y + box.height * y))), box);
              if (!exposed) throw new Error('A visible outcome or Back to latest action is covered');
            }
          };
          await assertActionExposed();
          if (await viewport.evaluate(element => element.scrollHeight > element.clientHeight)) {
            await viewport.evaluate(element => { element.scrollTop = 0; });
            await latest.waitFor({ state: 'visible' });
            await action.evaluate(element => element.scrollIntoView({ block: 'end' }));
            await assertActionExposed();
            await action.click({ trial: true });
            if (screenshots) await page.screenshot({ path: path.join(out, `${key}-latest-control.png`), animations: 'disabled' });
            await latest.click();
            await latest.waitFor({ state: 'hidden' });
            if (!await viewport.evaluate(element => element === document.activeElement)) throw new Error('Back to latest did not restore timeline focus');
          }
          await assertActionExposed();
          // Trial click checks the real center target without dispatching a native turn.
          await action.click({ trial: true });
        }
        if (name === 'task-dispatch-dsh') {
          // Regression: dsh task rows omitted the recorded model and effort chip.
          const scope = taskDetail;
          const chips = scope.getByLabel('V4.1 Flash · OpenCode Go · Max', { exact: true }).filter({ visible: true });
          await chips.first().waitFor({ state: 'visible' });
          for (const chip of await chips.all()) {
            if ((await chip.innerText()).includes(fixture.tasks[0].dispatchSummary.model)) throw new Error('Resolved dispatch chip exposes a raw model ID');
          }
        }
        if (setup) {
          // Regression: standard setup steps scrolled inside a fixed 496px shell on large windows.
          const layout = await page.evaluate(() => {
            const dialogs = [...document.querySelectorAll('.setup-dialog:has(.setup-steps)')];
            return dialogs.map(dialog => {
              const rect = dialog.getBoundingClientRect(), body = dialog.querySelector('.dialog-body');
              const tiles = [...dialog.querySelectorAll('.choice-tiles .choice-radio')].map(grid => [...grid.children].map(tile => {
                const r = tile.getBoundingClientRect(); return { width: r.width, top: r.top };
              }));
              return { recessed: dialog.hasAttribute('data-recessed'), stacked: !!dialog.querySelector('.setup-return'),
                x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width,
                scroll: body.scrollHeight - body.clientHeight, horizontalScroll: body.scrollWidth - body.clientWidth, tiles };
            });
          });
          row.layout = layout;
          if (!layout.length) throw new Error('Setup dialog was not rendered');
          for (const dialog of layout.filter(d => !d.recessed)) {
            if (dialog.x < 0 || dialog.y < 0 || dialog.right > width || dialog.bottom > height) throw new Error('Setup dialog exceeds the viewport');
            if (dialog.horizontalScroll > 1) throw new Error('Setup content scrolls horizontally');
            if (width >= 1280 && dialog.scroll > 1) throw new Error(`Standard setup step scrolls by ${dialog.scroll}px`);
            for (const tiles of dialog.tiles) {
              if (tiles.length >= 3 && (Math.abs(tiles[0].width - tiles[1].width) > 1 || Math.abs(tiles[1].width - tiles[2].width) > 1 || tiles[0].top !== tiles[2].top)) throw new Error('Platform grid is not three equal columns');
            }
            if (dialog.stacked && !layout.some(parent => parent.recessed && parent.width > dialog.width)) throw new Error('Stacked dialog is not narrower than its parent');
          }
        }
        if (fixture.update) {
          // Regression: update work groups and restart progress were hidden behind modal dialogs.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          if (fixture.settingsUpdates) {
            await page.getByText(messages['updates.currentVersion'], { exact: true }).waitFor({ state: 'visible' });
          } else if (['succeeded', 'rolled-back', 'failed', 'cancelled'].includes(fixture.update.state)) {
            const key = fixture.update.state === 'failed' && fixture.update.backupMoved ? 'updates.restoreFailed' : `updates.state.${fixture.update.state}`;
            await page.getByText(messages[key], { exact: true }).waitFor({ state: 'visible' });
          } else {
            const entry = page.getByRole('button', { name: messages.viewUpdate, exact: true });
            await entry.waitFor({ state: 'visible' });
            if (fixture.updatePanel === false) await entry.click();
            const panel = page.getByRole('dialog', { name: messages.appUpdates, exact: true });
            await panel.waitFor({ state: 'visible' });
            if (fixture.update.state === 'settling') {
              for (const group of ['blocking', 'willResume', 'unaffected']) await panel.getByRole('region', { name: messages[`updates.${group}`], exact: true }).waitFor({ state: 'visible' });
            }
            if (fixture.update.state === 'countdown') await panel.getByRole('list', { name: messages['updates.progress'] }).waitFor({ state: 'visible' });
          }
        }
        if (name.startsWith('task-objects-')) {
          // Regression: TASK convergence must preserve unread/reorder actions and recorded turn boundaries across hosts.
          const action = page.getByLabel('Task action', { exact: true });
          const nodes = page.getByRole('region', { name: 'Task nodes', exact: true });
          const unread = nodes.getByRole('button', { name: /Inspect task presentation.*Unread/i });
          await unread.focus();
          await page.keyboard.press('ArrowUp');
          if (await action.innerText() !== 'Move task -1') throw new Error('Task Node lost keyboard reorder');
          const markRead = nodes.getByRole('button', { name: 'Mark as read', exact: true });
          await markRead.focus(); await page.keyboard.press('Enter');
          if (await action.innerText() !== 'Marked task read' || await markRead.count()) throw new Error('Task Node lost its independent unread action');
          const rows = page.getByRole('region', { name: 'Task rows', exact: true });
          await rows.getByRole('button', { name: 'Native open', exact: true }).focus();
          await page.keyboard.press('Enter');
          if (await action.innerText() !== 'Native open') throw new Error('Task Row action navigated its parent');
          if (await rows.getByRole('button', { name: /^Stale dispatch/ }).isEnabled()) throw new Error('Stale dispatch invented a live destination');
          await page.getByRole('switch', { name: 'Task action error', exact: true }).click();
          await page.getByText('Synthetic task review failure', { exact: true }).waitFor();
          await page.getByRole('switch', { name: 'Task busy', exact: true }).click();
          const main = page.getByRole('main');
          for (let toggle = 0; toggle < 2; toggle++) {
            if ((await main.innerText()).includes('secret-must-not-render') || (await main.innerText()).includes('current-must-not-leak')) throw new Error('Task summary leaked secret history or another turn specification');
            if (await main.locator('[title], [aria-label]').evaluateAll(nodes => nodes.some(node => ['title', 'aria-label'].some(attr => /secret-must-not-render|current-must-not-leak/.test(node.getAttribute(attr) ?? ''))))) throw new Error('Task metadata leaked through an accessible label');
            await page.getByRole('button', { name: 'Privacy mode', exact: true }).click();
          }
          for (const name of ['Long native label', 'Long recorded effort']) {
            const spec = page.getByRole('region', { name, exact: true }).locator('.dispatch-spec');
            const fullLabel = await spec.getAttribute('aria-label');
            await spec.scrollIntoViewIfNeeded();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await spec.focus();
            const tooltip = page.getByRole('tooltip');
            await tooltip.waitFor();
            if (await tooltip.innerText() !== fullLabel) throw new Error('Truncated dispatch specification lost its complete tooltip');
            await page.keyboard.press('Escape');
          }
          const overflowingSpecs = await main.locator('.dispatch-spec').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth).map(node => node.getAttribute('aria-label')));
          if (overflowingSpecs.length) throw new Error('Dispatch specification content overflows its chip: ' + JSON.stringify(overflowingSpecs));
          if (await main.evaluate(node => node.scrollWidth > node.clientWidth)) throw new Error('Task objects overflow horizontally');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-tasks.png`), animations: 'disabled' });
        }
        if (name.startsWith('src-tunnel-')) {
          // Regression: source rows rendered inert connection labels and nested connection targets during object convergence.
          const rows = page.getByRole('region', { name: 'Source rows', exact: true });
          const source = rows.getByRole('button', { name: /^Shared account/ });
          await source.focus();
          await page.keyboard.press('Enter');
          const receipt = page.getByLabel('Object action', { exact: true });
          await page.getByText('Source: object-source', { exact: true }).waitFor();
          await page.keyboard.press('Tab');
          const chip = rows.getByRole('button', { name: /^Design connection/ });
          if (!await chip.evaluate(node => node === document.activeElement)) throw new Error('Connection Chip is not the independent next keyboard target');
          await page.keyboard.press('Enter');
          if (await receipt.innerText() !== 'Connection: object-tunnel') throw new Error('Connection Chip did not open its own connection');
          if (await rows.getByRole('button', { name: /^Revoked source/ }).isEnabled()) throw new Error('Disabled revoked row remains actionable');
          const references = page.getByRole('region', { name: 'References', exact: true });
          if (await references.getByRole('button', { name: /Removed connection|Historical source/ }).count()) throw new Error('Missing or historical references invent navigation');
          const targets = page.getByRole('region', { name: 'Mutation targets', exact: true });
          if (await page.getByRole('button', { name: 'Disconnect', exact: true }).count()) throw new Error('Grouped account silently picked a mutation target');
          await targets.getByRole('button', { name: /^Second source/ }).click();
          await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
          if (await receipt.innerText() !== 'Disconnect: second-source') throw new Error('Mutation lost the explicitly selected source');
          await page.getByRole('switch', { name: 'Refresh error', exact: true }).click();
          await page.getByText('Synthetic refresh failure', { exact: true }).first().waitFor();
          await page.getByRole('switch', { name: 'Busy', exact: true }).click();
          if (await page.getByRole('button', { name: 'Disconnect', exact: true }).isEnabled()) throw new Error('Busy mutation remains actionable');
          const main = page.getByRole('main');
          if ((await main.innerText()).includes('private@example.test') || (await main.innerText()).includes('https://private.example.test/mcp')) throw new Error('Privacy exposes raw identity or address');
          if (await main.locator('[title], [aria-label]').evaluateAll(nodes => nodes.some(node => ['title', 'aria-label'].some(attr => /private@example\.test|private\.example\.test/.test(node.getAttribute(attr) ?? ''))))) throw new Error('Privacy exposes identity through an accessible name or title');
          const privacy = page.getByRole('button', { name: 'Privacy mode', exact: true });
          await privacy.click();
          await page.getByText('private@example.test', { exact: true }).first().waitFor();
          await privacy.click();
          if (await main.evaluate(node => node.scrollWidth > node.clientWidth)) throw new Error('Object fixture overflows horizontally: ' + JSON.stringify(await main.evaluate(node => [...node.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1).slice(0, 12).map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 80), width: el.getBoundingClientRect().width })))));
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-objects.png`), animations: 'disabled' });
        }
        if (name === 'source-panel' || name === 'source-panel-light' || name === 'panels-src-l2' || name === 'panels-src-single' || name === 'panels-src-multiple-connections') {
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const panel = page.getByRole('dialog');
          await panel.getByRole('button', { name: messages['panels.rename'], exact: true }).waitFor();
          await panel.getByRole('button', { name: messages.back, exact: true }).click();
          await panel.getByRole('button', { name: messages['accounts.add'], exact: true }).waitFor();
          if (await panel.getByRole('radio').count()) throw new Error('SRC platform retains obsolete inspector tabs');
        }
        if (fixture.page === 'settings') {
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          await acceptSettings(page, fixture, messages, async () => {
            if (screenshots) await page.screenshot({ path: path.join(out, `${key}-entry.png`), animations: 'disabled' });
          });
        }
        if (name.startsWith('forms-')) {
          // Regression: settings forms had touching actions, decorative selectors and unlabelled advanced fields.
          await page.getByRole('button', { name: 'Custom surface action', exact: true }).click();
          await page.getByText('Surface activated', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Used 75 percent', exact: true }).click();
          await page.getByText('Used segment', { exact: true }).waitFor();
          if (await page.getByText('Retained hidden view', { exact: true }).isVisible()) throw new Error('Hidden panel view remains visible');
          const nav = page.getByRole('button', { name: 'Current version Agent Remote Control v1.0.0', exact: true });
          await nav.click();
          await page.getByText('Navigate to updates', { exact: true }).waitFor();
          for (const name of ['Release channel', 'Empty choices', 'Unlisted recorded choice']) {
            if (await page.getByRole('combobox', { name, exact: true }).count() || await page.getByRole('radiogroup', { name, exact: true }).count()) throw new Error('A static choice still exposes a selector');
          }
          await page.getByRole('button', { name: 'Save', exact: true }).click();
          const field = page.getByRole('textbox', { name: 'Label', exact: true });
          if (!await field.evaluate(node => node === document.activeElement && node.getAttribute('aria-invalid') === 'true')) throw new Error('Invalid field is not focused and marked');
          if (!await field.evaluate(node => node.getAttribute('aria-describedby').split(' ').every(id => document.getElementById(id)?.textContent))) throw new Error('Field help/error descriptions are not associated');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-validation.png`), animations: 'disabled' });
          await field.fill('Updated source');
          await page.getByRole('button', { name: 'Save', exact: true }).click();
          await page.getByText('Saved', { exact: true }).waitFor();
          const advanced = page.getByRole('button', { name: 'Advanced', exact: true });
          await advanced.focus();
          await page.keyboard.press('Space');
          if (await advanced.getAttribute('aria-expanded') !== 'false') throw new Error('Disclosure did not collapse');
          if (await field.isVisible()) throw new Error('Collapsed disclosure exposes fields');
          await page.keyboard.press('Enter');
          await field.waitFor({ state: 'visible' });
          const spec = page.getByRole('region', { name: 'Recorded dispatch specs', exact: true });
          await spec.scrollIntoViewIfNeeded();
          await spec.getByLabel('V4.1 Flash · OpenCode Go · Max', { exact: true }).waitFor({ state: 'visible' });
          // Regression: loading labels exposed an opaque model ID instead of a neutral placeholder.
          const loadingSpec = spec.getByLabel('Loading labels · Max · Fast', { exact: true });
          await loadingSpec.waitFor({ state: 'visible' });
          if ((await loadingSpec.innerText()).includes('["magpie"')) throw new Error('Loading dispatch chip exposes a raw model ID');
          if ((await spec.innerText()).includes('current-must-not-leak')) throw new Error('A historical turn inherited current defaults');
          if (screenshots) await page.screenshot({ path: path.join(out, `${key}-specs.png`), animations: 'disabled' });
          const collisions = await page.locator('.setting-row').evaluateAll(rows => rows.filter(row => {
            const label = row.querySelector('.setting-row-copy')?.getBoundingClientRect();
            const control = row.querySelector('.setting-row-control')?.getBoundingClientRect();
            return label && control && label.bottom > control.top && label.top < control.bottom && label.right > control.left;
          }).length);
          if (collisions) throw new Error('Setting labels overlap their trailing controls');
          const overflow = await page.getByRole('main').evaluate(node => node.scrollWidth > node.clientWidth);
          if (overflow) throw new Error('Forms overflow horizontally');
          await nav.scrollIntoViewIfNeeded();
          await nav.hover();
        }
        await writeFile(path.join(out, `${key}.json`), JSON.stringify(model, null, 2));
        if (screenshots) {
          const buffer = await page.screenshot({ path: path.join(out, `${key}.png`), animations: 'disabled' });
          if (previous) {
            let baseline;
            try { baseline = await readFile(path.join(base, previous, `${key}.png`)); } catch { /* New scenario. */ }
            if (baseline) {
              const before = PNG.sync.read(baseline), after = PNG.sync.read(buffer);
              await writeFile(path.join(out, `${key}-before.png`), baseline);
              if (before.width === after.width && before.height === after.height) {
                const diff = new PNG({ width: after.width, height: after.height });
                row.changedPixels = pixelmatch(before.data, after.data, diff.data, after.width, after.height, { threshold: 0.1 });
                row.changedRatio = row.changedPixels / (after.width * after.height);
                row.baseline = row.changedPixels ? 'changed' : 'unchanged';
                await writeFile(path.join(out, `${key}-diff.png`), PNG.sync.write(diff));
              } else row.baseline = 'dimensions-changed';
            }
          }
        }
        if (width >= 1280 && !fixture.page && !fixture.panel && fixture.tasks.some(task => task.completed)) {
          // Regression: dragging a completed card left a click guard that swallowed its mark-read action.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          for (const task of fixture.tasks.filter((task, index) => task.completed && model.topology.tasks.some(row => row.taskId === `fixture-task-${index}`))) {
            const bubble = page.getByRole('button').filter({ has: page.getByText(task.title, { exact: true }) });
            const bounds = await bubble.boundingBox();
            if (!bounds) throw new Error('Completed task is unavailable for mark-read acceptance');
            await bubble.dragTo(bubble, {
              sourcePosition: { x: bounds.width / 2, y: bounds.height / 2 },
              targetPosition: { x: bounds.width * 0.6, y: bounds.height * 0.6 },
            });
            const markRead = page.getByRole('button', { name: messages['activity.markRead'], exact: true });
            await markRead.click();
            await bubble.getByRole('img', { name: messages['activity.unread'], exact: true }).waitFor({ state: 'hidden' });
            if (await page.getByRole('dialog').count()) throw new Error('Mark-read opened a task detail panel');
          }
        }
      } catch (error) { errors.push(String(error)); }
      if (errors.length) report.failures.push(key);
      report.scenarios.push(row);
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>ARC UI acceptance</title><style>body{font:14px system-ui;background:#eee;color:#222;margin:24px}section{background:white;padding:16px;margin:16px 0;border-radius:12px}figure{margin:0}img{width:100%;border:1px solid #ccc} .images{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.changed{border-left:6px solid #d88b00}code{white-space:pre-wrap}</style><h1>ARC UI acceptance · ${engine}</h1><p>Previous: ${escape(report.previous ?? (screenshots ? 'none — first run has no baseline' : 'screenshots disabled'))} · failures: ${report.failures.length}</p>${report.scenarios.map(r => `<section class="${r.baseline.includes('changed') && r.baseline !== 'unchanged' ? 'changed' : ''}"><h2>${escape(r.key)} · ${r.baseline} ${r.changedPixels ?? ''}</h2>${r.errors.length ? `<code>${escape(r.errors.join('\n'))}</code>` : ''}${screenshots ? `<div class="images">${r.baseline !== 'missing' ? `<figure><figcaption>Previous</figcaption><img src="${r.key}-before.png"></figure>` : ''}<figure><figcaption>Current</figcaption><a href="${r.key}.png"><img src="${r.key}.png"></a></figure>${r.changedPixels !== null ? `<figure><figcaption>Pixel diff (${(r.changedRatio * 100).toFixed(3)}%)</figcaption><img src="${r.key}-diff.png"></figure>` : ''}</div>` : '<p>Screenshots disabled; layout measurements are in report.json.</p>'}<a href="${r.key}.json">View model</a></section>`).join('')}`);
console.log(JSON.stringify({ ok: !report.failures.length, directory: out, report: path.join(out, 'index.html'), failures: report.failures }));
process.exitCode = report.failures.length ? 1 : 0;
