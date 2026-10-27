import { acceptTopologyWires } from './topology-wires.mjs';
import { acceptNodeBranding } from './node-branding.mjs';
import { acceptLongRequest } from './requests.mjs';
import { acceptDispatchSpecBubbles } from './dispatch-spec.mjs';
import { acceptSettings } from './settings.mjs';
import { acceptLayout, acceptSurface, acceptTaskNavigation } from './surfaces.mjs';
import { acceptPanels } from './panels.mjs';
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
    const setup = !!(fixture.sourceSetup && fixture.sourceSetup.step !== 'welcome');
    if (setupOnly && !setup) continue;
    const name = file.slice(0, -5);
    const homepage = !fixture.page && !fixture.pageFixture;
    const longRequest = name === 'task-detail-long-question' || name === 'task-detail-long-approval';
    const outcome = name === 'task-detail-turn-failed' || name === 'task-detail-turn-interrupted';
    const viewports = fixture.page ? [{ width: 360, height: 800 }, ...report.viewports] : report.viewports;
    for (const { width, height } of viewports) {
      const key = `${name}-${width}x${height}`;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US' });
      page.setDefaultTimeout(8000);
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
        if (fixture.sourceSetup?.source === 'custom' && fixture.sourceSetup.step === 'address') {
          // Regression: f290eca exposed the registry name Custom in generic MCP instructions.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const dialog = page.getByRole('dialog');
          for (const key of ['setup.configureProduct', 'setup.clickConnect', 'connect.waitClient']) {
            await dialog.getByText(messages[key].replace('{name}', messages['setup.yourMcpClient']), { exact: true }).waitFor();
          }
          if (/\bCustom\b/.test(await dialog.innerText())) throw new Error('Generic MCP guide exposes an internal registry name');
        }
        if (homepage && !model.topology) throw new Error('No rendered topology exported');
        if (model.topology && homepage) {
          row.wires = await acceptTopologyWires(page);
          if (row.wires.orientation !== (width === 640 ? 'portrait' : 'landscape')) throw new Error('Homepage orientation does not match the viewport');
        }
        const actualAgents = (model.topology?.nodes ?? []).filter(n => n.side === 1).map(n => n.id);
        if (homepage && fixture.agents.some(a => !actualAgents.includes(a))) throw new Error('Fixture agents were not rendered');
        const representedTasks = model.topology?.tasks.reduce((sum, task) => sum + (task.count ?? 1), 0);
        if (homepage && !fixture.panel && representedTasks !== fixture.tasks.length) throw new Error(`Task count mismatch: ${representedTasks}/${fixture.tasks.length}`);
        if (fixture.panel?.kind === 'agent' && model.panels.agent?.agent !== fixture.panel.id) throw new Error('Agent panel not opened');
        if (fixture.panel?.kind === 'source' && !model.panels.source) throw new Error('Source panel not opened');
        if (fixture.panelAccounts || fixture.pageFixture === 'agents-settings') {
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          row.panel = await acceptPanels(page, fixture, name, messages, model);
        }
        if (fixture.connectionDeployment) {
          // Start from the real Connections entry rather than mounting an already-running job.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const main = page.getByRole('main');
          await main.getByRole('button', { name: messages['source.createRelay'], exact: true }).click();
          await main.getByRole('textbox', { name: messages['connect.copyLogin'], exact: true }).waitFor();
          await main.getByRole('button', { name: messages.cancel, exact: true }).waitFor();
        }
        if (name === 'navigation-redirects') {
          // Regression: removed dock targets need to redirect through the live App navigator.
          for (const [target, destination] of [['tasks', 'overview'], ['accounts', 'overview'], ['remote', 'connections'], ['permissions', 'settings']]) {
            await page.getByRole('button', { name: `Navigate ${target}`, exact: true }).click();
            await page.waitForFunction(destination => window.__ARC_VIEW_MODEL__().panels.page === destination, destination);
            await page.getByRole('status', { name: target }).filter({ hasText: destination }).waitFor();
          }
        }
        if (fixture.topologyAccounts) {
          // Regression: PlatformIcon convergence shrank the unringed Agent parent and ringed account logos.
          const parent = page.getByRole('button', { name: 'Claude Code', exact: true });
          if (await parent.getByRole('img').count()) throw new Error('Agent parent must remain without quota for the logo fixture');
          for (const name of ['Personal', 'Studio']) {
            const account = page.getByRole('button', { name, exact: true }).filter({ has: page.getByRole('img') });
            if (await account.count() !== 1) throw new Error('Each Agent account must expose its quota ring in the logo fixture');
          }
        }
        if (fixture.topologyAccounts && fixture.tasks.length) {
          const attributed = model.topology.tasks.find(task => task.taskId === 'fixture-task-0');
          const account = model.topology.nodes.find(node => node.side === 1 && node.accountId === 'example-personal');
          if (!account || attributed?.parent !== account.id) throw new Error('Claude task did not branch from its execution account');
          const unknown = model.topology.tasks.find(task => task.taskId === 'fixture-task-2');
          if (unknown?.parent !== 'claude') throw new Error('Unknown execution account was guessed');
          row.nodeBranding = await acceptNodeBranding(page);
          await page.getByLabel('Opus 5.5 · Medium', { exact: true }).waitFor({ state: 'visible' });
        }
        if (name.startsWith('task-bubbles-claude-spec')) {
          await acceptDispatchSpecBubbles(page, fixture);
        }
        if (name === 'agent-l2-unread') {
          // Regression: completed unread tasks were mixed into date groups instead of appearing between Running and Today.
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const panel = page.getByRole('dialog');
          await panel.getByRole('button', { name: messages['panels.rename'], exact: true }).waitFor();
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
          row.unread = { opened: completed.length, movedToToday: completed.length };
        }
        if (name === 'task-bubbles-overflow') {
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
          await acceptLayout(page);
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
        let taskDetail;
        if (fixture.detailTask !== undefined) {
          const task = fixture.tasks[fixture.detailTask];
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const title = task.agent === 'codex' ? task.title : messages['timeline.title'];
          taskDetail = page.getByRole('dialog', { name: title, exact: true });
          if (longRequest) row.requestBody = await acceptLongRequest(page, taskDetail, messages);
        }
        if (outcome) {
          // Regression: dc01e93 replaced the 95d397e viewport reservation with scroll padding, covering outcome actions.
          await page.evaluate(() => document.fonts.ready);
          const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
          const action = taskDetail.getByRole('button', { name: messages[name === 'task-detail-turn-failed' ? 'detail.retry' : 'detail.resumeInterrupted'], exact: true });
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
        if (name === 'task-detail-dispatch-dsh') {
          // Regression: dsh task rows omitted the recorded model and effort chip.
          const scope = taskDetail;
          const chips = scope.getByLabel('V4.1 Flash · OpenCode Go · Max', { exact: true }).filter({ visible: true });
          await chips.first().waitFor({ state: 'visible' });
          for (const chip of await chips.all()) {
            if ((await chip.innerText()).includes(fixture.tasks[0].dispatchSummary.model)) throw new Error('Resolved dispatch chip exposes a raw model ID');
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
        const messages = JSON.parse(await readFile(path.join(root, 'ui/locales', `${fixture.language}.json`), 'utf8'));
        row.layout = await acceptLayout(page);
        await writeFile(path.join(out, `${key}.json`), JSON.stringify(await page.evaluate(() => window.__ARC_VIEW_MODEL__()), null, 2));
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
        await acceptSurface(page, fixture, name, messages);
        await acceptSettings(page, fixture, messages);
        if (fixture.detailTask !== undefined) await acceptTaskNavigation(page, fixture, messages);
        row.finalLayout = await acceptLayout(page);
        const finalModel = await page.evaluate(() => window.__ARC_VIEW_MODEL__());
        if (finalModel.scenario?.error || finalModel.scenario?.missingRoutes?.length) throw new Error(finalModel.scenario.error || JSON.stringify(finalModel.scenario.missingRoutes));
        if (width >= 1280 && homepage && !fixture.panel && fixture.tasks.some(task => task.completed)) {
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
