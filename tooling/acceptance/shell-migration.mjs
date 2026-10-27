// Fixture-only shell checks. No native management, application run or installation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const out = new URL('../../output/playwright/mig-shell/', import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ mode: 'acceptance-fixture', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const address = server.httpServer.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
const scenarios = ['settings-light', 'settings-extras-light', 'accounts', 'agent-panel', 'agent-panel-empty', 'source-panel', 'topology-accounts', 'timeline-pending', 'foundation-light', 'shells-light', 'p3-welcome-light', 'p3-connection-local-dark', 'forms-light'];
const motion = process.argv.includes('--motion');
const filter = process.argv.find(arg => arg.startsWith('--scenario='))?.slice(11);
try {
  for (const scenario of scenarios.filter(name => !filter || name.includes(filter))) for (const theme of ['light', 'dark']) for (const width of [360, 1280]) {
    const key = `${scenario}-${theme}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: motion ? 'no-preference' : 'reduce' });
    const errors = [];
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
    try {
      await page.goto(`http://127.0.0.1:${address.port}/?scenario=${scenario}`);
      await page.waitForFunction(name => document.documentElement.dataset.scenarioReady === name || document.documentElement.dataset.scenarioError, scenario);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.scenarioError), undefined);
      await page.evaluate(async value => { const { theme } = await import('/theme.ts'); theme.set(value); }, theme);
      await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
      if (scenario === 'shells-light') {
        const short = page.getByRole('button', { name: 'Short preview target', exact: true });
        const long = page.getByRole('button', { name: 'Long preview target', exact: true });
        await short.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.mouse.move(0, 0);
        await short.hover();
        await page.getByRole('tooltip').waitFor({ state: 'visible' });
        const first = await page.getByRole('tooltip').elementHandle();
        await long.hover();
        await page.getByRole('tooltip').filter({ hasText: 'A longer preview' }).waitFor({ state: 'visible' });
        assert.equal(await page.getByRole('tooltip').evaluate((el, original) => el === original, first), true, 'Preview remains mounted between targets');
        await long.focus();
        await page.keyboard.press('Escape');
        await page.getByRole('tooltip').waitFor({ state: 'hidden' });
        assert.equal(await long.evaluate(el => document.activeElement === el), true);
        await first.dispose();
      }
      if (scenario === 'foundation-light') await page.getByRole('button', { name: 'Edit item', exact: true }).click();
      if (motion) await page.waitForFunction(() => document.getAnimations().every(animation => animation.effect?.getTiming().iterations === Infinity || animation.playState === 'finished'));
      const banner = page.locator('.task-needs-banner');
      const sheetOpened = scenario === 'timeline-pending' && await banner.isVisible();
      if (sheetOpened) await banner.click();
      const measurements = await page.evaluate(() => {
        const visible = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest('[hidden],[inert]') && getComputedStyle(el).visibility !== 'hidden'; };
        const roots = [...document.querySelectorAll('.workspace,.dialog-body,.agent-view-scroll,.side-panel-scroll,.page-sheet-content,.shell-fixture,[role="dialog"]')].filter(visible);
        const overflow = roots.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ element: el.className, width: el.clientWidth, scrollWidth: el.scrollWidth }));
        const bounds = [...document.querySelectorAll('.page-sheet,[role="dialog"],.connection-core')].filter(visible).map(el => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { role: el.getAttribute('role') ?? el.className, x, y, width, height };
        });
        return { bounds, overflow, documentOverflow: document.documentElement.scrollWidth > innerWidth };
      });
      await page.screenshot({ path: new URL(`${key}.png`, out).pathname, animations: 'disabled' });
      assert.deepEqual(errors, [], `${key}: runtime errors`);
      assert.deepEqual(measurements.overflow, [], `${key}: horizontal overflow`);
      assert.equal(measurements.documentOverflow, false, `${key}: document overflow`);
      for (const box of measurements.bounds) {
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${key}: horizontal panel bounds ${JSON.stringify(box)}`);
        assert.ok(box.y >= -1 && box.y + box.height <= 801, `${key}: vertical panel bounds ${JSON.stringify(box)}`);
      }
      if (sheetOpened) {
        assert.equal(await page.locator('[data-sheet]').count(), 1);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-sheet]'));
        await page.waitForFunction(() => document.activeElement?.matches('.task-needs-banner'));
        assert.equal(await page.locator('[data-panel-dock]').count(), 1, 'Escape keeps the parent panel open');
      }
      if (scenario === 'foundation-light') {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        assert.equal(await page.getByRole('button', { name: 'Edit item', exact: true }).evaluate(el => el === document.activeElement), true);
      }
      report.push({ key, ...measurements, errors, sheetOpened });
      console.log(`PASS ${key}`);
    } catch (error) {
      await page.screenshot({ path: new URL(`${key}-failure.png`, out).pathname, animations: 'disabled' });
      report.push({ key, failure: error.message, errors });
      console.error(`FAIL ${key}: ${error.message}`);
      process.exitCode = 1;
    } finally { await page.close(); }
  }
} finally {
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await server.close();
}
