export async function acceptSettings(page, fixture, messages, captureEntry = async () => {}) {
  if (fixture.page !== 'settings') return;
  if (fixture.settingsPermissions) {
    await page.getByRole('button', { name: messages.permissionsRefresh, exact: true }).waitFor();
    for (const id of ['accessibility', 'screen-recording', 'full-disk-access', 'notifications', 'login-start']) {
      await page.getByRole('heading', { name: messages[`permission.${id}`], exact: true }).waitFor();
    }
    if (await page.getByRole('textbox').count() || await page.getByRole('combobox').count()) throw new Error('System permissions exposes grant or tool-policy editing');
    return;
  }
  if (fixture.settingsUpdates) {
    const main = page.getByRole('region', { name: messages.settings, exact: true }).getByRole('main');
    if (fixture.update?.error) await page.getByText(fixture.update.error, { exact: true }).waitFor();
    for (const job of fixture.update?.recent ?? []) {
      if (job.instance && (await main.innerText()).includes(job.instance)) throw new Error('Update history exposes an internal instance ID');
      await page.getByText(messages[job.source.kind === 'local' ? 'updates.localVersion' : 'updates.releaseVersion'].replace('{version}', job.source.version), { exact: true }).waitFor();
    }
  }
  if (!fixture.settingsUpdates) {
    // Regression: advanced network and routing controls crowded the basic Settings path.
    if (await page.getByRole('spinbutton').count() || await page.getByRole('textbox').count()) throw new Error('Advanced configuration input remains in Settings');
    for (const key of ['controlSourceNotifications', 'automaticallyOpenCodexTasks', 'taskApprovalMode', 'connectAtSystemSignIn']) {
      await page.getByRole('switch', { name: messages[key], exact: true }).waitFor();
    }
    const permissions = page.getByRole('button', { name: messages.permissionsSystem, exact: true });
    await permissions.click();
    await page.getByRole('button', { name: messages.permissionsRefresh, exact: true }).waitFor();
    await page.getByRole('button', { name: messages.back, exact: true }).click();
    if (!await permissions.evaluate(element => document.activeElement === element)) throw new Error('Settings lost permission-entry focus');
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
  // Regression: technical update policy switches appeared beside everyday update actions.
  if (await page.getByRole('switch').count()) throw new Error('Advanced update policy switch remains in Settings');
  const choices = page.getByRole('combobox').or(page.getByRole('radiogroup'));
  if (await choices.count() !== 1) throw new Error('Updates should expose only installation timing');
  if (await choices.getAttribute('aria-label') !== messages['updates.installTiming']) throw new Error('Unexpected update setting');
}
