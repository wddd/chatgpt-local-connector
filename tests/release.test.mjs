import test from 'node:test';
import assert from 'node:assert/strict';
import { assetMatches, boundedMap, ghOptions, transferOptions, platformAssetNames, publicationStages,
  publishedTags, releaseByTag, retry, stageTimer, validateResume, validateRemoteAssets, validateArtifactInventory, parallelPlatforms, dependencyEnv } from '../tooling/release-support.mjs';
import { workerReady, canStopWorker, validateWindowsReceipt } from '../tooling/windows-release.mjs';

const asset = { name: 'latest.json', size: 120, digest: 'sha256:abc' };
const remote = { ...asset, state: 'uploaded' };
const state = { schema: 1, verified: true, version: '1.2.3', sourceSha: 'source', platforms: ['mac', 'linux'], assets: [asset] };

test('dependency installs reread npmrc script policy without mutating the parent environment', () => {
  // Regression: npm run exported allow-scripts and npm ci rejected it with EALLOWSCRIPTS.
  const env = { npm_config_allow_scripts: 'esbuild', NPM_CONFIG_ALLOW_SCRIPTS: 'esbuild', PATH: '/tools', npm_config_registry: 'https://example.com' };
  assert.deepEqual(dependencyEnv(env), { PATH: '/tools', npm_config_registry: 'https://example.com' });
  assert.equal(env.npm_config_allow_scripts, 'esbuild');
});

test('worker readiness requires power SSH and ready signals together', () => {
  // Property: running alone never authorizes SSH.
  const ready = { status: 'running', ssh_reachable: 'true', ready: 'true' };
  assert.equal(workerReady(ready), true);
  assert.equal(workerReady({ ...ready, ssh_reachable: true, ready: true }), true);
  for (const invalid of [{ ...ready, status: 'stopped' }, { ...ready, ready: 'false' }, { ...ready, ssh_reachable: false }, {}]) assert.equal(workerReady(invalid), false);
});

test('shutdown requires the original stopped worker and current ownership', () => {
  // Property: another invocation or a previously running worker cannot be shut down.
  const current = { owner: 'mine', owner_worker: 'windows' };
  assert.equal(canStopWorker({ status: 'stopped' }, current, 'mine'), true);
  assert.equal(canStopWorker({ status: 'running' }, current, 'mine'), false);
  assert.equal(canStopWorker({ status: 'stopped' }, current, 'other'), false);
  assert.equal(canStopWorker({ status: 'stopped' }, { ...current, owner_worker: 'linux' }, 'mine'), false);
});

test('Windows receipts bind version full SHA architecture filename and transferred bytes', () => {
  // Property: changing any artifact identity component invalidates the receipt.
  const request = { version: '1.2.3', sourceSha: 'a'.repeat(40), digest: 'sha256:abc' };
  const receipt = { ...request, file: 'agent-remote-control_1.2.3_x64-setup.exe', arch: 'x86_64', sha256: 'abc' };
  assert.doesNotThrow(() => validateWindowsReceipt(receipt, request));
  for (const patch of [{ version: '1.2.4' }, { sourceSha: 'b'.repeat(40) }, { arch: 'aarch64' }, { file: '../other.exe' }, { sha256: 'def' }]) {
    assert.throws(() => validateWindowsReceipt({ ...receipt, ...patch }, request));
  }
  assert.throws(() => validateWindowsReceipt(receipt, { ...request, sourceSha: 'short' }));
});

test('parallel platform failures drain every started build before returning', async () => {
  // Property: independent platforms start concurrently and no writer outlives failure reporting.
  const events = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const task = parallelPlatforms([
    async () => { events.push('mac start'); await gate; events.push('mac end'); },
    async () => { events.push('windows start'); release(); throw new Error('failed'); },
  ]);
  await assert.rejects(task, AggregateError);
  assert.deepEqual(events, ['mac start', 'windows start', 'mac end']);
});

test('exact release lookup treats only GitHub HTTP 404 as an absent tag', () => {
  // Regression: historical release listing exhausted the synchronous gh output buffer before upload.
  assert.deepEqual(releaseByTag('owner/repo', 'v1.2.3', () => JSON.stringify({ id: 42, draft: false })), { id: 42, draft: false });
  assert.equal(releaseByTag('owner/repo', 'v1.2.3', args => {
    if (args[1].includes('/tags/')) throw Object.assign(new Error(), { status: 1, stderr: 'gh: Not Found (HTTP 404)' });
    return JSON.stringify({ count: 0, matches: [] });
  }), undefined);
  for (const error of [Object.assign(new Error(), { status: 1, stderr: 'gh: Forbidden (HTTP 403)' }), Object.assign(new Error(), { code: 'ENOBUFS' })]) {
    assert.throws(() => releaseByTag('owner/repo', 'v1.2.3', () => { throw error; }), error);
  }
});

test('release lookup recovers a draft omitted by the tag endpoint across bounded pages', () => {
  // Regression: v0.9.29 created a draft, then stopped with Expected a draft release because its tag endpoint returned HTTP 404.
  const draft = { id: 42, tag_name: 'v1.2.3', draft: true, assets: [remote] };
  const result = releaseByTag('owner/repo', 'v1.2.3', args => {
    if (args[1].includes('/tags/')) throw Object.assign(new Error(), { status: 1, stderr: 'gh: Not Found (HTTP 404)' });
    if (args[1].endsWith('/42')) return JSON.stringify(draft);
    return JSON.stringify(args[1].endsWith('page=1') ? { count: 100, matches: [] } : { count: 1, matches: [{ id: 42 }] });
  });
  assert.deepEqual(result, draft);
});

test('release lookup refuses ambiguous drafts and preserves fallback permission failures', () => {
  // Regression: a missing tag response must not create another draft when authenticated draft lookup fails or is ambiguous.
  const lookup = operation => () => releaseByTag('owner/repo', 'v1.2.3', args => {
    if (args[1].includes('/tags/')) throw Object.assign(new Error(), { status: 1, stderr: 'gh: Not Found (HTTP 404)' });
    return operation();
  });
  assert.throws(lookup(() => JSON.stringify({ count: 2, matches: [{ id: 42 }, { id: 43 }] })));
  const forbidden = Object.assign(new Error('Forbidden'), { status: 1, stderr: 'gh: Forbidden (HTTP 403)' });
  assert.throws(lookup(() => { throw forbidden; }), forbidden);
});

test('release history uses bounded pages and retains only public stable tags', () => {
  // Regression: --paginate --slurp accumulated all historical release bodies and assets in one sync buffer.
  const result = publishedTags('owner/repo', args => {
    assert.equal(args.includes('--paginate'), false);
    assert.equal(args.includes('--slurp'), false);
    const url = new URL('https://api.github.com/' + args[1]);
    assert.equal(url.searchParams.get('per_page'), '100');
    if (url.searchParams.get('page') === '1') return JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ tag_name: `v1.0.${i}`, draft: i === 0, prerelease: i === 1 })));
    return JSON.stringify([{ tag_name: 'v1.1.0', draft: false, prerelease: false }]);
  });
  assert.equal(result.includes('v1.0.0'), false);
  assert.equal(result.includes('v1.0.1'), false);
  assert.equal(result.at(-1), 'v1.1.0');
  assert.equal(result.length, 99);
  assert.ok(ghOptions.maxBuffer >= 16 * 1024 * 1024);
  assert.ok(transferOptions.timeout > 0);
  assert.equal(transferOptions.env.GODEBUG.split(',').at(-1), 'http2client=0');
});

test('only uploaded assets matching size and every exposed digest can be skipped', () => {
  // Property: skipping preserves both the expected size and available content identity.
  assert.equal(assetMatches(asset, remote), true);
  assert.equal(assetMatches(asset, { ...remote, digest: null }), true);
  for (const candidate of [undefined, { ...remote, size: 119 }, { ...remote, digest: 'sha256:other' }, { ...remote, state: 'starter' }, { ...remote, name: 'other.json' }]) {
    assert.equal(assetMatches(asset, candidate), false);
  }
});

test('resume requires the original verified version commit and platform selection', () => {
  // Property: artifacts from different source identities or platform selections cannot be resumed.
  const request = { version: state.version, sourceSha: state.sourceSha, platforms: ['linux', 'mac'] };
  assert.doesNotThrow(() => validateResume(state, request));
  for (const invalid of [{ ...state, verified: false }, { ...state, sourceSha: 'other' }, { ...state, version: '1.2.4' }, { ...state, platforms: ['mac'] }, { ...state, assets: [] }]) {
    assert.throws(() => validateResume(invalid, request));
  }
});

test('publication refuses missing extra corrupt or unfinished remote assets', () => {
  // Property: every selected asset must be fully uploaded with matching size and exposed digest before publication.
  assert.doesNotThrow(() => validateRemoteAssets([asset], [remote]));
  assert.doesNotThrow(() => validateRemoteAssets([asset], [{ ...remote, digest: null }]));
  for (const inventory of [[], [remote, { ...remote, name: 'unexpected.exe' }], [{ ...remote, size: 0 }], [{ ...remote, digest: 'sha256:other' }], [{ ...remote, state: 'starter' }]]) {
    assert.throws(() => validateRemoteAssets([asset], inventory));
  }
});

test('resume detects replaced artifact bytes and inconsistent checksums', () => {
  // Regression: a retained artifact directory must not silently substitute files after verification.
  const sums = 'abc  latest.json\n';
  const inventory = [asset, { name: 'SHA256SUMS.txt', size: sums.length, digest: 'sha256:sums' }];
  assert.doesNotThrow(() => validateArtifactInventory(inventory, sums, inventory));
  assert.throws(() => validateArtifactInventory(inventory, 'other  latest.json\n', inventory));
  assert.throws(() => validateArtifactInventory(inventory, sums + 'extra  unselected.exe\n', inventory));
  assert.throws(() => validateArtifactInventory([{ ...asset, digest: 'sha256:other' }, inventory[1]], 'other  latest.json\n', inventory));
  assert.throws(() => validateArtifactInventory([asset, { ...inventory[1], size: 999 }], sums, inventory));
});

test('publication resumes missing uploads and verifies a complete draft before publishing', () => {
  // Regression: failed bulk uploads required manual draft creation and asset recovery.
  const draft = { id: 42, draft: true, assets: [remote] };
  assert.deepEqual(publicationStages(state, undefined), ['upload', 'remote verification', 'publish', 'readback']);
  assert.deepEqual(publicationStages(state, { ...draft, assets: [] }), ['upload', 'remote verification', 'publish', 'readback']);
  assert.deepEqual(publicationStages(state, draft), ['remote verification', 'publish', 'readback']);
  assert.deepEqual(publicationStages(state, { ...draft, assets: [{ ...remote, digest: 'sha256:other' }] }), ['upload', 'remote verification', 'publish', 'readback']);
});

test('a lost publish response allows read-only recovery only for the original publication attempt', () => {
  // Regression: a successful publish followed by failed latest.json readback must not overwrite a public version.
  const release = { id: 42, draft: false, assets: [remote] };
  assert.deepEqual(publicationStages({ ...state, publishAttempted: true, releaseId: 42 }, release), ['remote verification', 'readback']);
  assert.throws(() => publicationStages(state, release));
  assert.throws(() => publicationStages({ ...state, publishAttempted: true, releaseId: 41 }, release));
});

test('selected platforms require their complete updater and installer asset inventory', () => {
  // Property: a platform cannot be published from an incomplete or unrelated updater manifest.
  const manifest = { version: '1.2.3', platforms: { 'darwin-aarch64': { url: 'https://example.com/mac.app.tar.gz' } } };
  const names = platformAssetNames(manifest, '1.2.3', ['mac', 'linux']);
  assert.ok(names.includes('agent-remote-control-v1.2.3-linux-x86_64.tar.gz'));
  assert.ok(names.includes('agent-remote-control-v1.2.3-linux-aarch64.tar.gz'));
  assert.ok(names.includes('install-agent-remote-control.sh'));
  assert.ok(names.includes('agent-remote-control_1.2.3_aarch64.dmg'));
  assert.ok(names.includes('mac.app.tar.gz.sig'));
  assert.throws(() => platformAssetNames(manifest, '1.2.3', ['mac', 'windows', 'linux']));
  assert.throws(() => platformAssetNames(manifest, '1.2.3', ['linux']));
  assert.throws(() => platformAssetNames(manifest, '1.2.4', ['mac']));
  const linux = platformAssetNames({ version: '1.2.3', platforms: {} }, '1.2.3', ['linux']);
  assert.equal(linux.some(name => name.endsWith('.dmg') || name.endsWith('.exe')), false);
});

test('transient transfer failures recover after exponential backoff', async () => {
  // Regression: gh upload timeouts and HTTP/2 failures previously aborted the entire release without retry.
  const outcomes = [new Error('timeout'), new Error('connection reset'), 'uploaded'][Symbol.iterator]();
  const delays = [];
  const result = await retry(async () => {
    const value = outcomes.next().value;
    if (value instanceof Error) throw value;
    return value;
  }, { delayMs: 2, sleep: async ms => { delays.push(ms); } });
  assert.equal(result, 'uploaded');
  assert.deepEqual(delays, [2, 4]);
});

test('permanent transfer failures stop after the retry budget', async () => {
  // Property: transfer recovery has a finite backoff budget and preserves the terminal failure.
  const error = new Error('unavailable');
  const delays = [];
  await assert.rejects(retry(async () => { throw error; }, { attempts: 3, delayMs: 2, sleep: async ms => { delays.push(ms); } }), error);
  assert.deepEqual(delays, [2, 4]);
});

test('bounded uploads drain active transfers before returning a failure', async () => {
  // Regression: parallel upload failure must not leave background writers racing a resumed publication.
  let active = 0, maximum = 0;
  const delivered = [];
  await assert.rejects(boundedMap([1, 2, 3, 4, 5], async item => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      await new Promise(resolve => setTimeout(resolve, item === 1 ? 1 : 10));
      if (item === 1) throw new Error('failed');
      delivered.push(item);
    } finally { active--; }
  }), /failed/);
  assert.ok(maximum <= 3);
  assert.equal(active, 0);
  assert.deepEqual(delivered.sort(), [2, 3]);
});

test('stage timing closes successful failed and skipped stages', async () => {
  // Property: every started stage emits an end status and elapsed duration even on failure.
  const lines = [];
  const timer = stageTimer(null, line => lines.push(line));
  assert.equal(await timer.run('checks', async () => 42), 42);
  await assert.rejects(timer.run('upload', async () => { throw new Error('failed'); }));
  timer.skip('publish');
  for (const name of ['checks', 'upload', 'publish']) {
    assert.ok(lines.includes(`[stage] START ${name}`));
    assert.ok(lines.some(line => line.startsWith(`[stage] END ${name} `) && /\(\d+\.\d+s\)$/.test(line)));
  }
});
