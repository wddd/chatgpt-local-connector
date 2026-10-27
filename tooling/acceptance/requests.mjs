import { chooseSingleChoice } from './single-choice.mjs';

export async function assertRequestLayout(page) {
  // Regression: cae518e request cards overflowed 34px grid tracks and deployment intercepted Send answer.
  const layout = await page.getByRole('main').evaluate(main => {
    const items = [...main.children].map((element, index) => {
      const { top, right, bottom, left, height } = element.getBoundingClientRect();
      return { index, name: element.querySelector('h3')?.textContent ?? element.tagName, top, right, bottom, left, height };
    }).filter(item => item.height > 0 && item.right > item.left);
    const overlaps = items.flatMap((item, index) => items.slice(index + 1)
      .filter(next => Math.min(item.right, next.right) > Math.max(item.left, next.left)
        && Math.min(item.bottom, next.bottom) > Math.max(item.top, next.top))
      .map(next => ({ first: item, second: next })));
    return { items, overlaps, width: main.clientWidth, scrollWidth: main.scrollWidth };
  });
  if (layout.overlaps.length) throw new Error(`Request fixture items overlap: ${JSON.stringify(layout.overlaps)}`);
  return layout;
}

export async function acceptRequests(page) {
  // Regression: request controls were duplicated across task/update and setup/switch hosts.
  const setSubmission = name => chooseSingleChoice(page, 'Submission state', name);
  const request = page.getByRole('main');
  await request.getByRole('heading', { name: 'Requests and relay', exact: true }).waitFor();
  await assertRequestLayout(page);
  if (await page.getByText('secret-must-not-render', { exact: true }).count()) throw new Error('Secret receipt leaked');
  if ((await request.innerText()).includes('/sample/private/project')) throw new Error('Private path leaked');
  const secret = request.locator('input[type=password]');
  await secret.fill('local-secret-answer');
  await request.getByRole('checkbox', { name: 'Quick', exact: true }).press('Space');
  await request.getByRole('group', { name: 'Verification plan', exact: true }).press('2');
  if (!await request.getByRole('checkbox', { name: 'Complete', exact: true }).isChecked()) throw new Error('Numeric option selection failed');
  await request.getByRole('button', { name: 'Send answer', exact: true }).click();
  await page.getByText('Responded: answer', { exact: true }).waitFor();
  await request.getByRole('button', { name: 'Next request', exact: true }).press('Enter');
  await request.getByRole('heading', { name: 'Run verification', exact: true }).waitFor();
  await assertRequestLayout(page);
  if ((await request.innerText()).includes('/sample/private/project')) throw new Error('Private permission context leaked');
  await request.getByRole('switch', { name: 'Privacy', exact: true }).click();
  await request.getByText('/sample/private/project', { exact: true }).waitFor();
  await request.getByRole('switch', { name: 'Privacy', exact: true }).click();
  await request.getByRole('button', { name: 'Previous request', exact: true }).press('Enter');
  if (await secret.inputValue() !== 'local-secret-answer') throw new Error('Pager lost request draft');
  await setSubmission('unconfirmed');
  if (!await request.getByRole('button', { name: 'Send answer', exact: true }).isDisabled()) throw new Error('Unconfirmed response can be resubmitted');
  await setSubmission('failed');
  await page.getByText('Sample authorization failure', { exact: true }).waitFor();
  await assertRequestLayout(page);
  await setSubmission('pending');
  const trigger = request.getByRole('button', { name: 'Open request sheet', exact: true });
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Request sheet', exact: true });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  // Regression: the focus assertion ran before the overlay's restoration frame.
  await page.waitForFunction(element => element === document.activeElement, await trigger.elementHandle(), { timeout: 2000 });
  await request.getByRole('button', { name: 'Allow connection', exact: true }).click();
  await page.getByText('Authorization allowed', { exact: true }).waitFor();
  const retry = request.getByRole('button', { name: 'Retry', exact: true });
  if (!await retry.isDisabled()) throw new Error('Deployment retried without selecting an account');
  await request.getByRole('radiogroup', { name: 'Choose a Cloudflare account', exact: true }).getByRole('radio').first().click();
  await retry.click();
  await page.getByText('Retry deployment', { exact: true }).waitFor();
  await request.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText('Cancel deployment', { exact: true }).waitFor();
  if (await request.getByRole('button', { name: 'Remove', exact: true }).count() !== 1) throw new Error('Self member exposed removal');
  await assertRequestLayout(page);
  if (await request.evaluate(element => element.scrollWidth > element.clientWidth)) throw new Error('Request fixture overflows horizontally');
}

export async function acceptLongRequest(page, taskDetail, messages) {
  // Regression: narrow request sheets collapsed the body to zero height while long content overflowed it.
  const trigger = taskDetail.getByRole('button', { name: new RegExp(messages['detail.openRequest']) });
  const sheet = await trigger.isVisible();
  if (sheet) await trigger.press('Enter');
  const scope = sheet ? page.getByRole('dialog', { name: messages['detail.needsYou'], exact: true }) : taskDetail;
  const body = scope.locator('.request-card-body');
  await body.waitFor({ state: 'visible' });
  await body.scrollIntoViewIfNeeded();
  const reading = await body.evaluate(element => {
    const box = element.getBoundingClientRect();
    let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (!['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(ancestor).overflowY)) continue;
      const clip = ancestor.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    element.scrollTop = element.scrollHeight;
    return { height: element.clientHeight, visible: bottom - top, scroll: element.scrollTop, overflow: element.scrollHeight - element.clientHeight };
  });
  if (reading.height <= 0 || reading.visible <= 0) throw new Error('Request body has no visible reading area');
  if (reading.overflow > 0 && reading.scroll <= 0) throw new Error('Long request body cannot scroll');
  await body.evaluate(element => { element.scrollTop = 0; });
  return reading;
}
