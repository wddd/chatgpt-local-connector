import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = path.join(root, 'output/acceptance/ui');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
await mkdir(base, { recursive: true });
const previous = (await readdir(base)).filter(n => n.endsWith(`-${engine}`)).sort().at(-1);
const out = path.join(base, `${new Date().toISOString().replaceAll(':', '-')}-${engine}`);
await mkdir(out);
const scenarios = (await readdir(path.join(root, 'tooling/acceptance/scenarios'))).filter(f => f.endsWith('.json')).sort();
const report = { engine, previous: previous ?? null, widths: [640, 1280], scenarios: [], failures: [] };
// This server has no production owner dependency: fixture API calls are intercepted
// in the dev-only module, and the browser rejects every real management request.
const server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { port: 5187, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await ({ chromium, webkit }[engine]).launch();
  for (const file of scenarios) for (const width of report.widths) {
    const name = file.slice(0, -5), key = `${name}-${width}`;
    const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
    // Stable elapsed labels across runs, while rAF and the renderer keep working.
    await page.addInitScript(() => { const original = Date; const fixed = original.parse('2026-01-01T00:00:00Z'); Date = class extends original { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }; });
    const row = { name, width, key, errors, baseline: 'missing', changedPixels: null, changedRatio: null };
    try {
      await page.goto(`http://127.0.0.1:5187/?scenario=${encodeURIComponent(name)}`);
      await page.waitForFunction(name => document.documentElement.dataset.scenarioReady === name, name, { timeout: 15000 });
      const model = await page.evaluate(() => window.__ARC_VIEW_MODEL__());
      if (!model.topology) throw new Error('No rendered topology exported');
      const fixture = JSON.parse(await readFile(path.join(root, 'tooling/acceptance/scenarios', file), 'utf8'));
      const actualAgents = model.topology.nodes.filter(n => n.side === 1).map(n => n.id);
      if (fixture.agents.some(a => !actualAgents.includes(a))) throw new Error('Fixture agents were not rendered');
      if (!fixture.panel && model.topology.tasks.length !== fixture.tasks.length) throw new Error(`Task count mismatch: ${model.topology.tasks.length}/${fixture.tasks.length}`);
      if (fixture.panel?.kind === 'agent' && model.panels.agent?.agent !== fixture.panel.id) throw new Error('Agent panel not opened');
      if (fixture.panel?.kind === 'source' && model.panels.source !== fixture.panel.id) throw new Error('Source panel not opened');
      await writeFile(path.join(out, `${key}.json`), JSON.stringify(model, null, 2));
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
    } catch (error) { errors.push(String(error)); }
    if (errors.length) report.failures.push(key);
    report.scenarios.push(row);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>ARC UI acceptance</title><style>body{font:14px system-ui;background:#eee;color:#222;margin:24px}section{background:white;padding:16px;margin:16px 0;border-radius:12px}figure{margin:0}img{width:100%;border:1px solid #ccc} .images{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.changed{border-left:6px solid #d88b00}code{white-space:pre-wrap}</style><h1>ARC UI acceptance · ${engine}</h1><p>Previous: ${escape(previous ?? 'none — first run has no baseline')} · failures: ${report.failures.length}</p>${report.scenarios.map(r => `<section class="${r.baseline.includes('changed') && r.baseline !== 'unchanged' ? 'changed' : ''}"><h2>${escape(r.key)} · ${r.baseline} ${r.changedPixels ?? ''}</h2>${r.errors.length ? `<code>${escape(r.errors.join('\n'))}</code>` : ''}<div class="images">${r.baseline !== 'missing' ? `<figure><figcaption>Previous</figcaption><img src="${r.key}-before.png"></figure>` : ''}<figure><figcaption>Current</figcaption><a href="${r.key}.png"><img src="${r.key}.png"></a></figure>${r.changedPixels !== null ? `<figure><figcaption>Pixel diff (${(r.changedRatio * 100).toFixed(3)}%)</figcaption><img src="${r.key}-diff.png"></figure>` : ''}</div><a href="${r.key}.json">View model</a></section>`).join('')}`);
console.log(JSON.stringify({ ok: !report.failures.length, directory: out, report: path.join(out, 'index.html'), failures: report.failures }));
process.exitCode = report.failures.length ? 1 : 0;
