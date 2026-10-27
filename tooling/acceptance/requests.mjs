import { restoredFocus, acceptLayout } from './surfaces.mjs';

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
  if (sheet) {
    await acceptLayout(page);
    await page.keyboard.press('Escape');
    await scope.waitFor({ state: 'hidden' });
    await restoredFocus(page, trigger);
    await taskDetail.waitFor();
  }
  return reading;
}
