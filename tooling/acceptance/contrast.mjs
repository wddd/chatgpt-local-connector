// Fixture-only contrast measurements; no native owner or main-checkout acceptance.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';

const label = process.argv.includes('--before') ? 'before' : 'after';
// The before run overlays the committed palette on the same fixture components.
// No checkout or source mutation is needed while other validation is running.
let baseline;
if (label === 'before') {
  const source = execFileSync('git', ['show', 'HEAD:ui/tokens.css'], { encoding: 'utf8' });
  const sheet = postcss.parse(source);
  baseline = sheet.nodes.filter(node => node.type === 'rule' && node.selector.startsWith(':root')).map(node => node.toString()).join('\n')
    + (source.includes('--brand-foreground:') ? '' : '\n:root[data-theme] { --brand-foreground: var(--brand-accent); }');
}
const out = new URL(`../../output/playwright/contrast/${label}/`, import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ mode: 'acceptance-fixture', cacheDir: 'node_modules/.vite-contrast', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const scenarios = ['agent-objects-light', 'agent-objects-narrow', 'task-objects-light', 'debt-permissions-light', 'settings-light', 'settings-extras-light', 'p3-source-empty-light', 'right-panel', 'updates-countdown', 'updates-replacement-countdown', 'updates-replacement-immediate'];
try {
  for (const name of scenarios) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected live API request'); return route.abort(); });
    try {
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?scenario=${name}`);
      await page.waitForFunction(name => document.documentElement.dataset.scenarioReady === name || document.documentElement.dataset.scenarioError, name);
      await page.evaluate(async value => { const { theme } = await import('/theme.ts'); theme.set(value); }, theme);
      await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
      if (baseline) await page.addStyleTag({ content: baseline });
      const measurements = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].map((v, i) => i === 3 ? v / 255 : v); };
        const over = (a, b) => {
          const alpha = a[3] + b[3] * (1 - a[3]);
          return [...a.slice(0, 3).map((v, i) => alpha ? (v * a[3] + b[i] * b[3] * (1 - a[3])) / alpha : 0), alpha];
        };
        const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => x - y); return (values[1] + .05) / (values[0] + .05); };
        const rows = [], gaps = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node; (node = walker.nextNode());) {
          if (!node.textContent.trim()) continue;
          const element = node.parentElement;
          if (!element || element.closest('script,style,[aria-hidden=true],[disabled],[aria-disabled=true]')) continue;
          // Include the tone, phase and neutral text used by status, steps and recommendations.
          const owner = element.closest('[class*="text-muted-foreground"],[class*="text-brand-accent"],[class*="text-success"],[class*="text-warning"],[class*="text-destructive"],[class*="text-role-"],.phase-label,.state-badge,.status');
          if (!owner) continue;
          const range = document.createRange(); range.selectNode(node);
          const rect = range.getBoundingClientRect(), style = getComputedStyle(element);
          if (!rect.width || !rect.height || style.visibility !== 'visible') continue;
          const layers = []; let invisible = false, gradient = false;
          for (let parent = element; parent; parent = parent.parentElement) {
            const s = getComputedStyle(parent);
            if (Number(s.opacity) === 0 || s.visibility !== 'visible') invisible = true;
            if (s.backgroundImage !== 'none') gradient = true;
            layers.push({ background: rgba(s.backgroundColor), opacity: Number(s.opacity) });
          }
          if (invisible) continue;
          const text = node.textContent.trim(), fg = rgba(style.color);
          if (gradient) { gaps.push({ text, reason: 'Non-solid background' }); continue; }
          const composite = initial => {
            const pixel = layers.reduce((pixel, layer) => { const result = over(pixel, layer.background); result[3] *= layer.opacity; return result; }, initial);
            return over(pixel, [255, 255, 255, 1]);
          };
          const bg = composite([0, 0, 0, 0]), ink = composite(fg);
          const ratio = contrast(ink, bg), minimum = parseFloat(style.fontSize) >= 24 ? 3 : 4.5;
          rows.push({ text, ratio, minimum, fg, bg, ink, opacity: layers.reduce((value, layer) => value * layer.opacity, 1), color: style.color, classes: owner.className, fontSize: style.fontSize });
        }
        return { rows, gaps, scenarioError: document.documentElement.dataset.scenarioError };
      });
      if (measurements.scenarioError) errors.push(measurements.scenarioError);
      if (!measurements.rows.length) errors.push('No semantic text was measured');
      await page.screenshot({ path: new URL(`${name}-${theme}.png`, out).pathname, fullPage: true });
      const failures = measurements.rows.filter(row => row.ratio < row.minimum);
      results.push({ name, theme, ...measurements, failures, errors });
      console.log(JSON.stringify({ name, theme, measured: measurements.rows.length, minimum: Math.min(...measurements.rows.map(row => row.ratio)), failures: failures.map(({ text, ratio }) => ({ text, ratio })), gaps: measurements.gaps.length, errors }));
    } finally { await page.close(); }
  }
  await writeFile(new URL('measurements.json', out), JSON.stringify(results, null, 2) + '\n');
  if (results.some(row => row.errors.length || (label !== 'before' && (row.failures.length || row.gaps.length)))) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
