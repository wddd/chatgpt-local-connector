import test from 'node:test';
import assert from 'node:assert/strict';
import { idleUpdate, mergeUpdateSnapshot, updateActive, updateTerminal, updateCountdown, updateBlocks, updateStep, type UpdateSnapshot } from '../ui/state/updateModel.ts';
const job = (state: UpdateSnapshot['state'], patch: Partial<UpdateSnapshot> = {}): UpdateSnapshot => ({ ...idleUpdate(), id: 'job', state, ...patch });

test('a delayed poll cannot replace the current job with an older outcome', () => {
  // Regression: polling could overwrite a freshly retried replacement with the previous cancelled receipt.
  const previous = job('cancelled', { id: 'old', updatedAt: '2026-01-01T00:00:01Z' });
  const current = job('settling', { updatedAt: '2026-01-01T00:00:02Z' });
  assert.equal(mergeUpdateSnapshot(current, previous), current);
  assert.equal(mergeUpdateSnapshot(previous, current), current);
});

test('terminal outcomes release active update state', () => {
  // Property: every terminal update is inactive and every installation phase remains active.
  for (const state of ['succeeded', 'rolled-back', 'failed', 'cancelled'] as const) {
    assert.equal(updateTerminal(job(state)), true);
    assert.equal(updateActive(job(state)), false);
  }
  for (const state of ['downloading', 'settling', 'countdown', 'verifying', 'swapping', 'starting', 'resuming', 'rolling-back'] as const) {
    assert.equal(updateActive(job(state)), true);
    assert.equal(updateTerminal(job(state)), false);
  }
});

test('only blocking tasks in an active nondeferred job are marked', () => {
  // Property: resume and external work never acquire update blocker status.
  const snapshot = job('settling', { work: {
    blocking: [{ kind: 'turn', agent: 'codex', taskId: 'question', owner: 'connector' }],
    willResume: [{ kind: 'turn', agent: 'codex', taskId: 'parallel', owner: 'connector' }],
    unaffected: [{ kind: 'turn', agent: 'codex', taskId: 'desktop', owner: 'desktop' }],
  } });
  assert.equal(updateBlocks(snapshot, 'codex', 'question'), true);
  for (const id of ['parallel', 'desktop', 'other']) assert.equal(updateBlocks(snapshot, 'codex', id), false);
  assert.equal(updateBlocks(snapshot, 'claude', 'question'), false);
  assert.equal(updateBlocks({ ...snapshot, when: 'defer' }, 'codex', 'question'), false);
  assert.equal(updateBlocks({ ...snapshot, state: 'cancelled' }, 'codex', 'question'), false);
});

test('countdown requires a real scheduled restart', () => {
  // Property: only a valid countdown deadline yields nonnegative remaining seconds rounded up.
  const now = Date.parse('2026-01-01T00:00:00Z');
  const snapshot = job('countdown', { restartAt: '2026-01-01T00:00:10Z' });
  assert.equal(updateCountdown(snapshot, now), 10);
  assert.equal(updateCountdown(snapshot, now + 1500), 9);
  assert.equal(updateCountdown(snapshot, now + 11000), 0);
  assert.equal(updateCountdown({ ...snapshot, state: 'settling' }, now), undefined);
  assert.equal(updateCountdown({ ...snapshot, restartAt: 'invalid' }, now), undefined);
});

test('verification distinguishes package validation from health after swap', () => {
  // Regression: a single verifying label could imply health passed before the new app started.
  assert.ok(updateStep(job('verifying')) < updateStep(job('swapping')));
  assert.ok(updateStep(job('verifying', { backupMoved: true })) > updateStep(job('swapping')));
  assert.ok(updateStep(job('resuming')) < updateStep(job('succeeded')));
});

test('fresh acquisition state clears a previous job error without combining snapshots', () => {
  // Regression: a failed update check retained a stale offer and its download action.
  const old = job('available', { source: { kind: 'release', version: '1.2.3' }, error: 'Old error' });
  const checking = job('checking', { id: undefined, source: null });
  assert.deepEqual(mergeUpdateSnapshot(old, checking), checking);
  const failed = job('idle', { id: undefined, source: null, error: 'Check failed' });
  assert.equal(mergeUpdateSnapshot(checking, failed).source, null);
});
