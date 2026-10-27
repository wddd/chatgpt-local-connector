// Fixture-only geometry checks; this does not run the app or main-checkout acceptance.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const out = new URL('../../output/playwright/mig-settings/', import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ mode: 'acceptance-fixture', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const address = server.httpServer.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
const filter = process.argv.find(arg => arg.startsWith('--scenario='))?.slice('--scenario='.length);
const scenarios = ['settings-light', 'settings-extras-light', 'debt-agents-settings-light', 'debt-agent-display-settings-light', 'debt-permissions-light', 'debt-records-light', 'management-table-light', 'updates-settings', 'updates-long-notes', 'updates-downloading', 'updates-countdown', 'updates-restore-failed', 'updates-settling'].filter(name => !filter || name.includes(filter));
async function geometry(page) {
  return page.evaluate(() => {
    const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const containers = [...document.querySelectorAll('.workspace,.dialog-body,.update-panel,.update-notes,.update-impact,.update-outcome,.shell-fixture')].filter(visible);
    const overflow = containers.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ element: el.className, width: el.clientWidth, scrollWidth: el.scrollWidth }));
    const bounds = [...document.querySelectorAll('.page-sheet,[role="dialog"],.update-outcome,.shell-fixture')].filter(visible).map(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { role: el.getAttribute('role'), x, y, width, height };
    });
    const escaped = containers.flatMap(root => [...root.querySelectorAll('button,input,[role="combobox"]')].filter(visible).filter(el => {
      if (el.closest('[data-slot="table-container"]')) return false;
      const r = el.getBoundingClientRect(), p = root.getBoundingClientRect();
      return r.left < p.left - 1 || r.right > p.right + 1;
    }).map(el => el.getAttribute('aria-label') || el.textContent));
    return { bounds, overflow, escaped, documentOverflow: document.documentElement.scrollWidth > innerWidth };
  });
}
try {
  for (const name of scenarios) for (const mode of ['light', 'dark']) for (const width of [360, 900]) {
    const key = `${name}-${mode}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
    try {
      await page.goto(`http://127.0.0.1:${address.port}/?scenario=${name}`);
      await page.waitForFunction(name => document.documentElement.dataset.scenarioReady === name || document.documentElement.dataset.scenarioError, name);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.scenarioError), undefined);
      await page.evaluate(async mode => { const { theme } = await import('/theme.ts'); theme.set(mode); }, mode);
      await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, mode);
      const measurements = await geometry(page);
      assert.deepEqual(measurements.overflow, [], `${key}: horizontal container overflow`);
      assert.deepEqual(measurements.escaped, [], `${key}: controls escape their container`);
      assert.equal(measurements.documentOverflow, false, `${key}: document overflow`);
      assert.ok(measurements.bounds.length, `${key}: no fixture surface`);
      for (const box of measurements.bounds) {
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${key}: surface outside viewport`);
        assert.ok(box.width > 0 && box.height > 0, `${key}: empty surface`);
      }
      if (width === 360) await page.screenshot({ path: new URL(`${key}.png`, out).pathname, animations: 'disabled' });
      if (name === 'settings-light') {
        await page.getByRole('radio', { name: 'Custom', exact: true }).click();
        await page.getByRole('textbox', { name: 'Proxy URL', exact: true }).fill('invalid proxy');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        const field = page.getByRole('textbox', { name: 'Proxy URL', exact: true });
        assert.equal(await field.getAttribute('aria-invalid'), 'true');
        assert.equal(await field.evaluate(el => document.activeElement === el), true);
        assert.ok(await field.getAttribute('aria-describedby'));
        await page.getByRole('button', { name: /Relay hosting & experimental/ }).click();
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: /Relay hosting & experimental/ }).evaluate(el => document.activeElement === el), true);
      }
      if (name === 'settings-extras-light') {
        const radio = page.getByRole('radio', { name: /Experimental/ });
        if (await radio.count()) await radio.click();
        else {
          await page.getByRole('combobox', { name: 'Extras', exact: true }).click();
          await page.getByRole('option', { name: /Experimental/ }).click();
        }
        await page.getByRole('switch', { name: 'Home topology tuning', exact: true }).waitFor();
        assert.deepEqual((await geometry(page)).overflow, []);
      }
      if (name === 'debt-agents-settings-light') {
        const cards = page.getByRole('article', { name: /^Reorder / });
        const before = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
        await cards.first().focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(first => document.querySelector('article[aria-label]')?.getAttribute('aria-label') !== first, before[0]);
        assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), [before[1], before[0]]);
        const trigger = page.getByRole('button', { name: 'Agent settings', exact: true });
        await trigger.click();
        await page.getByRole('dialog', { name: 'Agent settings', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog', { name: 'Agent settings', exact: true }).waitFor({ state: 'hidden' });
        assert.ok(await page.getByRole('dialog', { name: 'Agents', exact: true }).count());
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Agent settings');
      }
      if (name === 'management-table-light') {
        await page.getByRole('button', { name: '2', exact: true }).first().click();
        await page.getByRole('button', { name: 'Operation 4', exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('output').first().textContent(), 'Operation 4');
      }
      if (name === 'debt-records-light') {
        await page.getByRole('textbox', { name: 'Search logs', exact: true }).fill('no matching operation');
        assert.equal(await page.getByRole('table').getByRole('row').count(), 1);
      }
      if (name === 'updates-long-notes') {
        const before = await page.locator('.update-panel-footer').boundingBox();
        await page.locator('.update-notes').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const after = await page.locator('.update-panel-footer').boundingBox();
        assert.deepEqual(after, before, 'Scrolling notes moved update actions');
        assert.ok(after.y + after.height <= 800, 'Update actions are clipped');
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await page.getByRole('dialog', { name: 'App updates', exact: true }).waitFor({ state: 'hidden' });
        const trigger = page.getByRole('button', { name: 'View update', exact: true });
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Close', exact: true }).focus();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'View update');
      }
      assert.deepEqual(errors, []);
      report.push({ key, ...measurements, passed: true });
    } catch (error) {
      report.push({ key, passed: false, error: String(error), errors });
      await page.screenshot({ path: new URL(`${key}-failure.png`, out).pathname });
    } finally { await page.close(); }
    console.log(`${key}: ${report.at(-1).passed ? 'PASS' : report.at(-1).error}`);
  }
} finally {
  await browser.close();
  await server.close();
  await writeFile(new URL(`report-${filter ?? 'all'}.json`, out), JSON.stringify(report, null, 2) + '\n');
}
assert.ok(report.every(row => row.passed), `${report.filter(row => !row.passed).length}/${report.length} fixture checks failed`);
