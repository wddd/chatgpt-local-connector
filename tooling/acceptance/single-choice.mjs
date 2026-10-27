export async function chooseSingleChoice(page, label, name, timeout = 5000) {
  // Regression: Select's closing modal temporarily hides both modes from role queries.
  const popup = page.getByRole('listbox');
  await popup.waitFor({ state: 'hidden', timeout });
  const dropdown = page.getByRole('combobox', { name: label, exact: true });
  const group = page.getByRole('radiogroup', { name: label, exact: true });
  await dropdown.or(group).waitFor({ state: 'visible', timeout });
  if (await dropdown.isVisible()) {
    await dropdown.press('Space', { timeout });
    await page.getByRole('option', { name, exact: true }).click({ timeout });
    await popup.waitFor({ state: 'hidden', timeout });
  } else {
    await group.getByRole('radio', { name, exact: true }).press('Space', { timeout });
  }
  // Re-resolve the mode after selection: changing content can change available width.
  await group.getByRole('radio', { name, exact: true, checked: true })
    .or(dropdown.getByText(name, { exact: true })).waitFor({ state: 'visible', timeout });
}
