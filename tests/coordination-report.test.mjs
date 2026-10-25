import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reportLifecycle } from '../tooling/coordination-report.mjs';

async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'arc-observer-report-'));
  try {
    await mkdir(path.join(directory, 'app'));
    await writeFile(path.join(directory, 'app/native.json'), JSON.stringify({ port: 1, pid: 10, instance: 'fixture', token: 'fixture-token' }));
    await run(directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const body = { transitionId: 'fixture-transition', kind: 'lane.created', repository: '/fixture', lane: 'fixture' };

test('Core down is missing coverage and leaves tooling completion independent', async () => {
  // Contract: local tooling reports missing coordination coverage when Core cannot be reached.
  await fixture(async directory => {
    const result = await reportLifecycle(body, { stateDirectory: directory, request: async () => { throw new Error('unreachable'); } });
    assert.equal(result.coverage, 'missing');
    assert.equal(result.transitionId, body.transitionId);
    assert.equal(JSON.stringify(result).includes('fixture-token'), false);
  });
});
test('local lifecycle requires identity and transition readback', async () => {
  // Contract: a successful local POST alone never establishes observed lifecycle coverage.
  await fixture(async directory => {
    const request = async url => new Response(JSON.stringify(url.endsWith('healthz')
      ? { instance: 'fixture', pid: 10, owner: 'core' }
      : { state: 'accepted' }), { status: 200 });
    assert.equal((await reportLifecycle(body, { stateDirectory: directory, request })).coverage, 'missing');
    const confirmed = async url => new Response(JSON.stringify(url.endsWith('healthz')
      ? { instance: 'fixture', pid: 10, owner: 'core' }
      : { transitionId: body.transitionId, kind: body.kind, state: 'observed' }), { status: 200 });
    assert.equal((await reportLifecycle(body, { stateDirectory: directory, request: confirmed })).coverage, 'readback-confirmed');
  });
});
