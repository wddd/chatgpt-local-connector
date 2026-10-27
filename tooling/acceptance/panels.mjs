export async function returnToAccount(page, panel, messages) {
  const titles = [...new Set(await panel.getByRole('heading', { level: 2 }).allTextContents())];
  await panel.getByRole('button', { name: messages.back, exact: true }).click();
  await panel.getByRole('button', { name: messages['accounts.add'], exact: true }).waitFor();
  if (await panel.getByRole('radio').count()) throw new Error('Platform retains obsolete inspector tabs');
  // The shell may also expose a screen-reader title. Match the account's
  // accessible row instead of relying on title order or the platform name.
  const matching = [];
  for (const title of titles) {
    const row = panel.getByRole('button').filter({ has: page.getByText(title, { exact: true }) });
    if (await row.count()) matching.push({ title, row });
  }
  if (matching.length !== 1) throw new Error('Back did not reveal the selected account in L1');
  const { title, row } = matching[0];
  await row.click();
  await panel.getByRole('button', { name: messages['panels.rename'], exact: true }).waitFor();
  await panel.getByRole('heading', { name: title, exact: true, level: 2 }).first().waitFor();
  return title;
}

export async function acceptPanels(page, fixture, state, messages, model) {
  const panel = page.getByRole('dialog');
  await panel.waitFor({ state: 'visible' });
  if (fixture.pageFixture === 'agents-settings') {
    // Regression: this page fixture was rejected for not exporting a homepage topology.
    await panel.getByRole('heading', { name: messages.installedAgents, exact: true }).waitFor();
    await panel.getByRole('heading', { name: messages.notInstalledAgents, exact: true }).waitFor();
    for (const [agent, enabled] of [['Codex', true], ['Claude Code', false]]) {
      const toggle = panel.getByRole('switch', { name: messages.allowConnectorToUseValue.replace('{agent}', agent), exact: true });
      if (await toggle.isChecked() !== enabled) throw new Error(`Agent discovery state is wrong for ${agent}`);
    }
    await panel.getByRole('button', { name: /Pi/ }).waitFor();
    if (await panel.getByRole('button', { name: messages['accounts.add'], exact: true }).count()) throw new Error('Agent settings exposes account management');
    return { kind: 'agent-settings' };
  }

  if (fixture.panel.kind === 'source') {
    const { platform, accountId } = fixture.panel;
    const selected = model.topology.nodes.filter(node => node.side === -1 && node.selected);
    if (platform && !selected.some(node => node.platform === platform) && model.panels.source !== platform) {
      throw new Error('SRC panel did not select the requested platform');
    }
    if (accountId && !selected.some(node => node.platform === platform && node.accountId === accountId)) {
      throw new Error('SRC panel did not select the requested account');
    }
  } else if (fixture.panel.accountId && model.panels.agent?.accountId !== fixture.panel.accountId) {
    throw new Error('AGENT panel did not select the requested account');
  }

  // Regression: portrait AGENT panels claimed a right dock but rendered at the left viewport edge.
  const side = fixture.panel.kind === 'source' ? 'left' : 'right';
  const bounds = await panel.boundingBox(), viewport = page.viewportSize();
  if (!bounds) throw new Error('Panel has no visible surface');
  const left = bounds.x, right = viewport.width - bounds.x - bounds.width;
  const edge = side === 'left' ? left : right, opposite = side === 'left' ? right : left;
  if (edge < 0 || edge > 18 || opposite < edge - 1 || bounds.y < 0 || bounds.y + bounds.height > viewport.height) {
    throw new Error(`${side} panel is not docked inside the viewport: ${JSON.stringify(bounds)}`);
  }
  if (state === 'panels-task-l3') {
    await panel.getByRole('button', { name: messages.back, exact: true }).waitFor();
    return { side, bounds, level: 3 };
  }
  const add = panel.getByRole('button', { name: messages['accounts.add'], exact: true });
  const rename = panel.getByRole('button', { name: messages['panels.rename'], exact: true });
  const back = panel.getByRole('button', { name: messages.back, exact: true });
  const accountLevel = !!fixture.panel.accountId || state.endsWith('-single') || state.endsWith('-multiple-connections');
  if (accountLevel) {
    // Regression: platform/account selectors were compared with the obsolete source panel.id.
    await rename.waitFor();
    await panel.getByRole('button', { name: messages.remove, exact: true }).waitFor();
    if (await add.count()) throw new Error('Account panel unexpectedly exposes the platform Add account action');
    const alias = await returnToAccount(page, panel, messages);
    return { side, bounds, level: 2, returnedToAccount: alias };
  }
  await add.waitFor();
  if (await rename.count() || await back.count()) throw new Error('Platform panel opened account actions');
  if (state.endsWith('-empty')) await panel.getByText(messages['panels.noAccounts'], { exact: true }).waitFor();
  if (state === 'panels-agent-l1' || state === 'panels-src-l1') {
    // Regression: account rows filled the panel height, and attention was conveyed only by color.
    const agent = fixture.panel.kind === 'agent';
    const healthy = panel.getByRole('button', { name: new RegExp(agent ? 'Studio' : 'Unidentified') });
    const attention = panel.getByRole('button', { name: /Review/ });
    await attention.getByText(messages[agent ? 'accounts.profile.signed-out' : 'source.state.disconnected'], { exact: true }).waitFor();
    await healthy.getByRole('img', { name: messages[agent ? 'accounts.profile.signed-in' : 'source.state.connected'], exact: true }).waitFor();
    const boxes = await Promise.all([add, healthy, attention].map(control => control.boundingBox()));
    if (boxes.some(box => !box || box.height > 88) || boxes.slice(1).some((box, index) => (box.y < boxes[index].y + boxes[index].height || box.y - boxes[index].y - boxes[index].height > 24))) {
      throw new Error(`Account rows must have compact content height and start at the top: ${JSON.stringify(boxes)}`);
    }
    if (agent && await panel.getByRole('region').count()) throw new Error('AGENT L1 exposes an aggregate task list');
    return { side, bounds, level: 1, rows: boxes.slice(1) };
  }
  return { side, bounds, level: 1 };
}
