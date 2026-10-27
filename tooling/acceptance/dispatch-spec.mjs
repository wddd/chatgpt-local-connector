export async function acceptDispatchSpecBubbles(page, fixture) {
  // Regression: inline dispatch chips were required to match larger project tags exactly.
  for (const [index, label] of [[0, 'Claude Opus 5.5 · Medium'], [1, 'High · Fast'], [3, 'GPT-6-Astra · High']]) {
    const task = page.getByRole('button', { name: new RegExp(`^${fixture.tasks[index].title} ·`) });
    const chip = task.getByLabel(label, { exact: true });
    const project = task.getByText('acceptance', { exact: true });
    await chip.waitFor({ state: 'visible' });
    await project.waitFor({ state: 'visible' });
    const [specBox, tagBox, taskBox] = await Promise.all([chip.boundingBox(), project.boundingBox(), task.boundingBox()]);
    const inside = box => box && taskBox && box.width > 0 && box.height > 0
      && box.x >= taskBox.x && box.y >= taskBox.y
      && box.x + box.width <= taskBox.x + taskBox.width
      && box.y + box.height <= taskBox.y + taskBox.height;
    if (!inside(specBox) || !inside(tagBox) || specBox.height > tagBox.height
      || specBox.x + specBox.width > tagBox.x
      || Math.min(specBox.y + specBox.height, tagBox.y + tagBox.height) <= Math.max(specBox.y, tagBox.y)) {
      throw new Error('Recorded dispatch metadata does not fit beside its project tag');
    }
    if (await chip.evaluate(node => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)) {
      throw new Error('Recorded dispatch metadata overflows its chip');
    }
  }
  const missing = page.getByRole('button', { name: new RegExp(`^${fixture.tasks[2].title} ·`) });
  await missing.waitFor({ state: 'visible' });
  // This task records neither model nor effort; it must have no labelled metadata chip.
  if (await missing.getByLabel(/.+/).count()) throw new Error('Unrecorded Claude task invented a dispatch spec');
}
