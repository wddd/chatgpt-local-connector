export async function acceptAgentObjectGeometry(page) {
  // Regression: percentage-sized Agent logos expanded ordinary references and collapsed profile copy.
  const geometry = await page.evaluate(() => {
    const logos = [...document.querySelectorAll('.object-chip > .agent-logo, .entity-row > .agent-logo')].map(node => {
      const expected = node.parentElement.classList.contains('object-chip') ? 16 : 20;
      const box = node.getBoundingClientRect(), svg = node.querySelector('svg').getBoundingClientRect();
      return { expected, width: box.width, height: box.height, svgWidth: svg.width, svgHeight: svg.height };
    });
    const profiles = [...document.querySelectorAll('.entity-row-actions.agent-profile-row')].map(node => {
      const title = node.querySelector('.entity-row-title'), range = document.createRange();
      range.selectNodeContents(title);
      const box = title.getBoundingClientRect(), actions = node.querySelector('.actions').getBoundingClientRect();
      const state = node.querySelector('.status').getBoundingClientRect();
      const overlap = other => Math.min(box.right, other.right) > Math.max(box.left, other.left) + 1 && Math.min(box.bottom, other.bottom) > Math.max(box.top, other.top) + 1;
      return {
        clipped: box.width === 0 || [...range.getClientRects()].some(rect => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1),
        overlap: overlap(actions) || overlap(state),
        overflow: node.scrollWidth > node.clientWidth,
      };
    });
    return { logos, profiles };
  });
  if (!geometry.logos.length || geometry.logos.some(logo => [logo.width, logo.height, logo.svgWidth, logo.svgHeight].some(size => Math.abs(size - logo.expected) > 1))) throw new Error('Ordinary Agent logos lost their explicit control size');
  if (!geometry.profiles.length || geometry.profiles.some(profile => profile.clipped || profile.overlap || profile.overflow)) throw new Error('Profile identity is clipped, overlaps controls, or overflows');
  return geometry;
}

export async function acceptAgentObjects(page) {
  // Regression: same-Agent profile controls targeted the first profile and SRC authorization used a parallel renderer.
  const main = page.getByRole('main');
  await main.getByRole('heading', { name: 'AGENT objects', exact: true }).waitFor();
  await acceptAgentObjectGeometry(page);
  const receipt = page.getByLabel('Agent object action', { exact: true });
  const inspector = page.getByRole('region', { name: 'Profile inspector', exact: true });
  const defaults = inspector.getByRole('switch');
  if (await defaults.count() !== 3) throw new Error('Grouped inspector lost a profile');
  if (!await defaults.nth(0).isChecked() || await defaults.nth(1).isChecked()) throw new Error('Default profile evidence changed');
  await defaults.nth(1).focus();
  await page.keyboard.press('Space');
  if (await receipt.innerText() !== 'Default: profile-two') throw new Error('Default mutation did not target the chosen profile');
  if (await defaults.nth(0).isChecked() || !await defaults.nth(1).isChecked()) throw new Error('Default mutation changed the wrong profile');
  await inspector.getByRole('button', { name: /Profile 3.*Sign in again/ }).press('Enter');
  if (await receipt.innerText() !== 'Reauth: profile-three') throw new Error('Reauthentication did not target the chosen profile');
  if (!await defaults.nth(2).isDisabled()) throw new Error('Signed-out profile can become default');
  const auth = page.getByRole('region', { name: 'Source authorization', exact: true });
  if ((await auth.innerText()).includes('Old authorization')) throw new Error('SRC exposes authorization history');
  if (await auth.getByRole('button', { name: /^Current authorization/ }).count()) throw new Error('Current authorization Chip opens an unrelated pending request');
  await auth.getByText('Current authorization', { exact: false }).first().waitFor();
  await auth.getByRole('button', { name: /^Pending authorization/ }).press('Enter');
  if (await receipt.innerText() !== 'Authorization: pending') throw new Error('Pending authorization did not open its own request');
  await page.getByRole('switch', { name: 'Retained read error', exact: true }).click();
  await inspector.getByText('Synthetic retained read failure', { exact: true }).waitFor();
  if (await inspector.getByRole('switch').count() !== 3) throw new Error('Refresh error discarded readable profiles');
  await page.getByRole('switch', { name: 'Busy profiles', exact: true }).click();
  if (await inspector.getByRole('button').filter({ hasText: 'Sign in again' }).evaluateAll(nodes => nodes.some(node => !node.disabled))) throw new Error('Busy profile action remains enabled');
  if ((await main.innerText()).includes('private@example.test')) throw new Error('Privacy leaks identity');
  if (await main.locator('[title], [aria-label]').evaluateAll(nodes => nodes.some(node => ['title', 'aria-label'].some(attr => /private@example\.test|Private organization/.test(node.getAttribute(attr) ?? ''))))) throw new Error('Privacy leaks identity in accessible text');
  await page.getByRole('button', { name: 'Privacy mode', exact: true }).click();
  await inspector.getByText('private@example.test', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Privacy mode', exact: true }).click();
  if (await main.evaluate(node => node.scrollWidth > node.clientWidth)) throw new Error('Agent objects overflow horizontally');
  await acceptAgentObjectGeometry(page);
}
