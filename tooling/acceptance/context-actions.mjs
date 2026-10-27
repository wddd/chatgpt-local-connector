import { restoredFocus } from './surfaces.mjs';

export async function acceptContextActions(page) {
  // Regression: contextual editors must retain errors and isolate Escape from their containing surface.
  const pencil = page.getByRole('button', { name: 'Rename', exact: true });
  await pencil.click();
  const input = page.getByRole('textbox', { name: 'Alias', exact: true });
  await input.fill(''); await input.press('Enter');
  await page.getByRole('alert').waitFor();
  await input.fill('failure'); await input.press('Enter');
  await page.getByRole('alert').waitFor();
  await input.fill('Renamed team'); await input.press('Enter');
  await input.waitFor({ state: 'hidden' }); await restoredFocus(page, pencil);
  await page.getByRole('heading', { name: 'Renamed team', level: 2 }).waitFor();
  await pencil.click(); await input.fill('Blur team');
  await page.getByRole('heading', { name: 'Copy', exact: true }).click();
  await input.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Blur team', level: 2 }).waitFor();
  await pencil.click(); await input.fill('Cancelled'); await input.press('Escape');
  await restoredFocus(page, pencil);
  await page.getByRole('heading', { name: 'Blur team', level: 2 }).waitFor();
  const menu = page.getByRole('button', { name: 'Account actions', exact: true });
  await menu.click(); await page.keyboard.press('Escape'); await restoredFocus(page, menu);
  await menu.click(); await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove', exact: true });
  await confirmation.waitFor(); await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' }); await restoredFocus(page, menu);
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('status', { name: 'Copied value' }).waitFor();
  const gear = page.getByRole('button', { name: 'Bubble width', exact: true });
  await gear.click();
  const options = page.getByRole('dialog', { name: 'Bubble width', exact: true });
  await options.getByRole('radio', { name: 'wide', exact: true }).click();
  await page.getByRole('status', { name: 'Selected width' }).filter({ hasText: 'wide' }).waitFor();
  await page.keyboard.press('Escape'); await restoredFocus(page, gear);
  await menu.click(); await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
  await menu.waitFor({ state: 'hidden' });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.scenarioReady);
  return { rename: true, confirm: true, copy: true, width: true };
}
