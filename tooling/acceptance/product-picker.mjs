// Run against a dev:ui server in acceptance-fixture mode. This never starts ARC.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const url = new URL(argument('url') ?? 'http://127.0.0.1:5196');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Use a local acceptance-fixture server.');
const output = path.resolve(argument('output') ?? 'output/acceptance/product-picker');
const messages = JSON.parse(await readFile('ui/locales/zh-CN.json', 'utf8'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

async function geometry(dialog) {
  return dialog.evaluate(root => {
    const visible = element => element.checkVisibility({ visibilityProperty: true });
    const box = element => {
      const bounds = element.getBoundingClientRect();
      return { name: element.getAttribute('aria-label') ?? element.textContent, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
    };
    const panel = box(root);
    const pickers = [...root.querySelectorAll('.choice')].filter(visible).map(choice => {
      const bounds = box(choice);
      const controls = [...choice.querySelectorAll('[role="radio"],[role="combobox"]')].filter(visible).map(box);
      const overrun = Math.max(0, ...controls.map(control => Math.max(control.right - bounds.right, bounds.left - control.left)));
      return { ...bounds, controls, overrun, overflow: Math.max(0, bounds.scrollWidth - bounds.clientWidth) };
    });
    const body = root.querySelector('.side-panel-scroll');
    return { theme: document.documentElement.dataset.theme, panel, body: body && box(body), pickers, scenarioError: document.documentElement.dataset.scenarioError };
  });
}

function checkGeometry(measured) {
  if (measured.scenarioError) throw new Error(measured.scenarioError);
  if (!measured.pickers.length || measured.pickers.some(picker => !picker.controls.length || picker.width <= 0 || picker.height <= 0)) throw new Error('Product controls are missing or empty.');
  if (measured.pickers.some(picker => picker.overrun > 2 || picker.overflow > 2)) throw new Error('Product controls exceed their picker width.');
  if (measured.body && measured.body.scrollWidth > measured.body.clientWidth + 2) throw new Error('Product controls widen the panel body.');
}

async function focused(page, name) {
  await page.waitForFunction(name => document.activeElement?.getAttribute('aria-label') === name, name);
}

async function popupGeometry(page) {
  const list = page.getByRole('listbox');
  await list.waitFor();
  const bounds = await list.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, options: [...element.querySelectorAll('[role="option"]')].map(option => option.getAttribute('aria-label')) };
  });
  if (bounds.left < 0 || bounds.right > page.viewportSize().width || bounds.scrollWidth > bounds.clientWidth + 2) throw new Error('Product menu is clipped horizontally.');
  return bounds;
}

async function keyboard(page, dialog) {
  const product = messages['source.product'], more = messages['source.moreProducts'];
  const trigger = page.getByRole('combobox', { name: product, exact: true });
  const mode = await trigger.count() ? 'select' : 'pills';
  let popup;
  if (mode === 'select') {
    await trigger.press('Space');
    popup = await popupGeometry(page);
    await page.keyboard.press('End');
    await focused(page, more);
    await page.keyboard.press('ArrowUp');
    await focused(page, 'Grok');
    await page.keyboard.press('Escape');
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
    await focused(page, product);
    if (!await dialog.isVisible()) throw new Error('Escape closed the panel instead of the product menu.');
    await trigger.press('Space');
    await page.getByRole('listbox').waitFor();
    await page.keyboard.press('End');
    await focused(page, more);
    await page.keyboard.press('Enter');
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
  } else {
    await page.getByRole('radiogroup', { name: product, exact: true }).getByRole('radio', { name: 'Claude', exact: true }).focus();
    await page.keyboard.press('End');
    await focused(page, more);
    await page.keyboard.press('ArrowLeft');
    await focused(page, 'Grok');
    await page.keyboard.press('End');
    await focused(page, more);
    await page.keyboard.press('Space');
  }
  const overflow = page.getByRole('combobox', { name: more, exact: true });
  await overflow.waitFor();
  const expanded = await geometry(dialog);
  checkGeometry(expanded);
  await overflow.press('Space');
  const morePopup = await popupGeometry(page);
  if (!morePopup.options.includes('Grok')) throw new Error('The full product menu omits Grok.');
  await page.keyboard.press('Escape');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  await focused(page, more);
  return { mode, popup, morePopup, expanded };
}

try {
  // Regression: custom product content was wider than SingleChoice's label-only measurement.
  for (const theme of ['light', 'dark']) for (const width of [360, 640, 1280, 1920]) for (const height of [800, 1080]) for (const surface of ['fixed', 'panel']) {
    const name = surface === 'fixed' ? `p3-source-fixed-${theme}` : theme === 'light' ? 'source-panel-light' : 'source-panel';
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push(`Unexpected live API: ${route.request().url()}`); return route.abort(); });
    let measured, interaction;
    try {
      await page.goto(new URL(`/?scenario=${name}`, url).href);
      await page.waitForFunction(name => document.documentElement.dataset.scenarioError || document.documentElement.dataset.scenarioReady === name, name);
      await page.evaluate(() => document.fonts.ready);
      if (surface === 'panel') {
        await page.getByRole('radio', { name: messages['accounts.tab.connection'], exact: true }).click();
        await page.getByRole('button', { name: messages['accounts.advanced'], exact: true }).click();
      }
      const dialog = page.getByRole('dialog').last();
      await page.waitForTimeout(200);
      measured = await geometry(dialog);
      await page.screenshot({ path: path.join(output, `${name}-${width}x${height}.png`) });
      checkGeometry(measured);
      if (surface === 'panel') {
        interaction = await keyboard(page, dialog);
        if (width === 1920 && height === 1080) {
          interaction.resizes = [];
          for (const resizedWidth of [1280, 1920]) {
            await page.setViewportSize({ width: resizedWidth, height });
            await page.getByRole(resizedWidth === 1280 ? 'combobox' : 'radiogroup', { name: messages['source.product'], exact: true }).waitFor();
            await page.waitForTimeout(200);
            const resized = await geometry(dialog);
            checkGeometry(resized);
            interaction.resizes.push({ width: resizedWidth, ...resized });
          }
        }
      }
    } catch (error) { errors.push(String(error)); }
    finally { await page.close(); }
    results.push({ name, width, height, errors, ...measured, interaction });
  }
} finally { await browser.close(); }
const report = path.join(output, 'report.json');
await writeFile(report, JSON.stringify(results, null, 2) + '\n');
const failures = results.filter(result => result.errors.length);
console.log(JSON.stringify({ viewports: results.length, failures: failures.map(({ name, width, height, errors }) => ({ name, width, height, errors })), report }, null, 2));
if (failures.length) process.exitCode = 1;
