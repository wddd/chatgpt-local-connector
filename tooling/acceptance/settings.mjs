export async function acceptSettings(page, fixture, messages, captureEntry = async () => {}) {
  if (fixture.page !== 'settings') return;
  if (fixture.settingsExtras) {
    await page.getByRole('switch', { name: messages['topology.tuning'], exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('switch', { name: messages['extras.maintainerMode'], exact: true }).waitFor({ state: 'visible' });
    return;
  }
  if (fixture.settingsPermissions) { await page.getByRole('button', { name: messages.permissionsRefresh, exact: true }).waitFor(); return; }
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
