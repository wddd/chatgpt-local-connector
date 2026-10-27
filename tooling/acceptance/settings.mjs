import { chooseSingleChoice } from './single-choice.mjs';

export async function acceptSettings(page, fixture, messages, captureEntry = async () => {}) {
  if (fixture.page !== 'settings') return;
  if (fixture.settingsExtras) {
    // Regression: Extras fixtures inherited assertions for the App updates entry.
    const hosting = page.getByRole('heading', { name: messages['hosting.title'], exact: true });
    const tuning = page.getByRole('switch', { name: messages['topology.tuning'], exact: true });
    await hosting.waitFor({ state: 'visible' });
    await chooseSingleChoice(page, messages['extras.title'], messages['topology.experimental']);
    await tuning.waitFor({ state: 'visible' });
    await page.getByRole('switch', { name: messages['extras.maintainerMode'], exact: true }).waitFor({ state: 'visible' });
    if (await hosting.isVisible()) throw new Error('Extras navigation retained the inactive hosting pane');
    await chooseSingleChoice(page, messages['extras.title'], messages['extras.hosting']);
    await hosting.waitFor({ state: 'visible' });
    if (await tuning.isVisible()) throw new Error('Extras navigation retained the inactive experimental pane');
    return;
  }
  if (!fixture.settingsUpdates) {
    // Regression: the App updates entry repeated its title and failed to navigate.
    const section = page.getByRole('region', { name: messages.appUpdates, exact: true });
    await section.waitFor({ state: 'visible' });
    if (await section.getByText(messages.appUpdates, { exact: true }).count() !== 1) throw new Error('Repeated update title');
    const entry = section.getByRole('button').filter({ hasText: messages['updates.currentVersion'] });
    await entry.scrollIntoViewIfNeeded();
    await entry.hover();
    await captureEntry();
    await entry.click();
  }
  await page.getByRole('heading', { name: messages['updates.currentVersion'], exact: true }).waitFor({ state: 'visible' });
  const channel = messages['updates.releaseChannel'];
  if (await page.getByRole('combobox', { name: channel, exact: true }).count()
    || await page.getByRole('radiogroup', { name: channel, exact: true }).count()) throw new Error('Single release channel remains interactive');
}
