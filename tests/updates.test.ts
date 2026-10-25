import test from 'node:test';
import assert from 'node:assert/strict';
import { replacementCountdown, mergeUpdateSnapshot, mergeReplacement, replacementActive, replacementFailed, replacementForApp, type UpdateSnapshot } from '../ui/state/updateModel.ts';
const offer = { available: true, version: '1.2.3', notes: 'Release changes', ready: false };

test('failed checks invalidate previous offers instead of retaining their download action', () => {
  // Regression: a failed update check kept displaying the version and release notes from an earlier check.
  const previous: UpdateSnapshot = {revision: 1, phase: 'idle', update: offer};
  const checking = mergeUpdateSnapshot(previous, {revision: 2, phase: 'checking', update: offer});
  assert.equal(checking.update, null);
  const failed = mergeUpdateSnapshot(checking, {revision: 3, phase: 'idle', errorStage: 'check', error: 'Network unavailable', update: offer});
  assert.equal(failed.update, null);
  assert.equal(failed.errorStage, 'check');
  assert.equal(failed.error, 'Network unavailable');
});

test('older checks cannot overwrite download progress or a completed download', () => {
  // Regression: polling restored an old check failure between successful checking and automatic downloading.
  const downloading: UpdateSnapshot = {revision: 5, phase: 'downloading', update: offer, downloaded: 20};
  const delayed: UpdateSnapshot = {revision: 4, phase: 'idle', errorStage: 'check', error: 'Previous failure'};
  assert.deepEqual(mergeUpdateSnapshot(downloading, delayed), downloading);
  const ready = mergeUpdateSnapshot(downloading, {revision: 6, phase: 'idle', update: {...offer, ready: true}});
  assert.deepEqual(mergeUpdateSnapshot(ready, downloading), ready);
  assert.equal(ready.update?.ready, true);
});

test('active operations clear prior errors while transfer failures retain a retryable offer', () => {
  // Regression: a check error flashed while the successful automatic download was already active.
  const active = mergeUpdateSnapshot(undefined, {revision: 2, phase: 'downloading', update: offer, error: 'Previous failure', errorStage: 'check'});
  assert.equal(active.error, null);
  assert.equal(active.update?.version, offer.version);
  const failed = mergeUpdateSnapshot(active, {revision: 3, phase: 'idle', update: offer, errorStage: 'download', error: 'Transfer interrupted'});
  assert.equal(failed.update?.version, offer.version);
  assert.equal(failed.update?.ready, false);
  assert.equal(failed.errorStage, 'download');
});

test('replacement cancellation and rollback are failures rather than successful handoffs', () => {
  // Regression: a cancelled replacement had no visible outcome and its receipt was mistaken for installation success.
  for (const state of ['cancelled', 'rolled-back', 'failed']) {
    assert.equal(replacementFailed({state}), true);
    assert.equal(replacementActive({state}), false);
  }
  for (const state of ['waiting-for-turns', 'verifying', 'installing', 'starting']) {
    assert.equal(replacementActive({state}), true);
    assert.equal(replacementFailed({state}), false);
  }
  assert.equal(replacementFailed({state:'succeeded'}), false);
});

test('a later installation resolves only the matching cancelled package', () => {
  // Regression: recovery by installing the intended package could leave an obsolete cancellation alert after restart.
  const cancelled = {id:'replacement', state:'cancelled', package:{version:'1.2.3', desktopBuild:'intended-build'}};
  assert.equal(replacementForApp(cancelled, 'intended-build').state, 'superseded');
  assert.equal(replacementForApp(cancelled, 'different-build').state, 'cancelled');
  assert.equal(replacementForApp({...cancelled, state:'failed'}, 'intended-build').state, 'failed');
});

 test('a delayed replacement poll cannot restore the previous cancelled job', () => {
  // Regression: polling could overwrite a freshly retried replacement with the previous cancelled receipt.
  const previous = {id:'old-job', state:'cancelled', updatedAt:'2026-01-01T00:00:01Z'};
  const current = {id:'new-job', state:'waiting-for-turns', updatedAt:'2026-01-01T00:00:02Z'};
  assert.deepEqual(mergeReplacement(current, previous), current);
  assert.equal(mergeReplacement(previous, current).id, current.id);
});

test('replacement countdown reflects a scheduled restart without inventing an ETA for work', () => {
  // Property: only a valid countdown deadline produces a nonnegative remaining time rounded up to seconds.
  const now = Date.parse('2026-01-01T00:00:00Z');
  const job = {state:'countdown',restartAt:'2026-01-01T00:00:10Z'};
  assert.equal(replacementCountdown(job, now), 10);
  assert.equal(replacementCountdown(job, now + 1500), 9);
  assert.equal(replacementCountdown(job, now + 11000), 0);
  assert.equal(replacementCountdown({...job,state:'installing'}, now), undefined);
  assert.equal(replacementCountdown({...job,restartAt:'invalid'}, now), undefined);
  assert.equal(replacementActive(job), true);
});
