// Run against a dev:ui server in acceptance-fixture mode. This never starts ARC.
import { chromium } from 'playwright';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const url = new URL(argument('url') ?? 'http://127.0.0.1:5194');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Use a local acceptance-fixture server.');
const filter = argument('scenario');
const names = (await readdir('tooling/acceptance/scenarios')).filter(name => /^(p3-|connections-|requests-|src-tunnel-|source-panel)/.test(name) && name.endsWith('.json')).map(name => name.slice(0, -5)).filter(name => !filter || name.includes(filter)).sort();
if (!names.length) throw new Error('No matching connection fixtures.');
const output = path.resolve('output/acceptance/connections-layout');
await mkdir(output, { recursive: true });
const report = path.join(output, `report-${encodeURIComponent(filter ?? 'all')}.json`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [360, 1280]) for (const name of names) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
    try {
      await page.goto(new URL(`/?scenario=${encodeURIComponent(name)}`, url).href);
      await page.waitForFunction(name => document.documentElement.dataset.scenarioError || document.documentElement.dataset.scenarioReady === name, name);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      // Regression: hidden SingleChoice measurement and setup instruction tracks widened narrow dialogs.
      const geometry = await page.evaluate(() => {
        const visible = element => element.checkVisibility({ visibilityProperty: true });
        const roots = [...document.querySelectorAll('[role="dialog"],main,.workspace')].filter(visible);
        const box = element => {
          const bounds = element.getBoundingClientRect();
          return { role: element.getAttribute('role') ?? element.tagName, name: (element.getAttribute('aria-label') ?? element.textContent ?? '').slice(0, 80), top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
        };
        const overflow = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))].filter(element => {
          // Topology paints beyond node bounds; task question fields belong to the task lane.
          if (!visible(element) || element.closest('[aria-hidden="true"],.topology-scene,.graph-node,.task-question-options')) return false;
          const style = getComputedStyle(element);
          return element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2 && ['visible', 'auto', 'scroll'].includes(style.overflowX) && style.whiteSpace !== 'nowrap' && style.textOverflow !== 'ellipsis';
        }).map(box);
        const overlaps = [...document.querySelectorAll('main.shell-fixture')].flatMap(main => {
          const children = [...main.children].filter(visible).map(box).filter(child => child.height && child.width);
          return children.flatMap((child, index) => children.slice(index + 1)
            .filter(next => Math.min(child.right, next.right) > Math.max(child.left, next.left) && Math.min(child.bottom, next.bottom) > Math.max(child.top, next.top))
            .map(next => ({ first: child, second: next })));
        });
        return { theme: document.documentElement.dataset.theme, error: document.documentElement.dataset.scenarioError, roots: roots.map(box), overflow, overlaps };
      });
      if (geometry.error) errors.push(geometry.error);
      if (!geometry.roots.length || geometry.roots.some(root => root.width <= 0 || root.height <= 0)) errors.push('Fixture has an empty rendering root.');
      if (geometry.overlaps.length) errors.push(`Overlapping fixture content in ${geometry.overlaps.length} pairs.`);
      if (geometry.overflow.length) errors.push(`Horizontal overflow in ${geometry.overflow.length} elements.`);
      if (errors.length) await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
      results.push({ name, width, errors, ...geometry });
    } catch (error) { results.push({ name, width, errors: [...errors, String(error)] }); }
    finally { await page.close(); }
    if (results.length % 20 === 0) console.log(`Rendered ${results.length}/${names.length * 2} fixture viewports.`);
  }
} finally { await browser.close(); }
await writeFile(report, JSON.stringify(results, null, 2) + '\n');
const failures = results.filter(result => result.errors.length);
console.log(JSON.stringify({ viewports: results.length, failures: failures.map(({ name, width, errors }) => ({ name, width, errors })), report: report }, null, 2));
if (failures.length) process.exitCode = 1;
