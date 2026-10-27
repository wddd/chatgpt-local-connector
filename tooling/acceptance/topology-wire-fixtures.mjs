// Lane-safe browser fixtures; never calls the main-only acceptance runner.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { measureTopologyWires, assertTopologyWires } from './topology-wires.mjs';

const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a lowercase artifact label');
const out = new URL(`../../output/playwright/topology-wires/${label}/`, import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ mode: 'acceptance-fixture', server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const scenario of ['idle', 'light', 'dark', 'topology-accounts', 'topology-accounts-dark'])
    for (const theme of scenario === 'idle' ? ['light', 'dark'] : [scenario.includes('dark') ? 'dark' : 'light'])
      for (const width of [360, 640, 1280]) for (const reduced of [true, false]) {
        const key = `${scenario}-${theme}-${width}-${reduced ? 'reduced' : 'motion'}`;
        const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const errors = [], row = { key, scenario, theme, width, reduced, errors };
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
        await page.addInitScript(() => { const Original = Date, fixed = Original.parse('2026-01-01T00:00:00Z'); Date = class extends Original { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }; });
        try {
          await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?scenario=${scenario}`);
          await page.waitForFunction(name => document.documentElement.dataset.scenarioReady === name || document.documentElement.dataset.scenarioError, scenario);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.scenarioError), undefined);
          await page.evaluate(async mode => { const { theme } = await import('/theme.ts'); theme.set(mode); }, theme);
          await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, theme);
          row.measurement = await measureTopologyWires(page);
          row.animation = await page.evaluate(async () => {
            const paths = [...document.querySelectorAll('.topology-scene .topology-wires[data-inactive="false"] .activity-flow,.topology-scene .topology-wires[data-inactive="false"] .connecting-wire')].filter(path => path.getAttribute('d'));
            const before = paths.map(path => getComputedStyle(path).strokeDashoffset), start = performance.now();
            await new Promise(resolve => { const sample = () => performance.now() - start >= 120 ? resolve() : requestAnimationFrame(sample); requestAnimationFrame(sample); });
            return paths.map((path, index) => ({ before: before[index], after: getComputedStyle(path).strokeDashoffset }));
          });
          await page.screenshot({ path: new URL(`${key}.png`, out).pathname });
          assertTopologyWires(row.measurement);
          assert.equal(row.measurement.orientation, width < 800 ? 'portrait' : 'landscape');
          assert.deepEqual(errors, []);
          if (scenario !== 'idle') {
            assert.ok(row.measurement.paths.some(path => ['portrait-task', 'task-body'].includes(path.kind)), 'Task branches are present');
            assert.ok(row.animation.length, 'Running task flow is present');
          }
          assert.ok(row.animation.every(frame => reduced ? frame.before === frame.after : frame.before !== frame.after), 'Flow follows the reduced-motion setting');
          console.log(`PASS ${key}`);
        } catch (error) {
          row.failure = error.message; process.exitCode = 1;
          console.error(`FAIL ${key}: ${error.message.slice(0, 220)}`);
        } finally { report.push(row); await page.close(); }
      }
} finally {
  await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await server.close();
}
