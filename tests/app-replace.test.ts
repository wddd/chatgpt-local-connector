import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempDisposableSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

// Run against a freshly built Core; no Desktop or installed state is used.
const binary = process.env.ARC_TEST_BINARY || path.resolve('target/debug/arc');
const temporary = mkdtempDisposableSync(path.join(tmpdir(), 'arc-replace-cli-'));
const environment = { ...process.env, ARC_STATE_DIR: temporary.path };
after(() => temporary.remove());

test('replacement status is readable with no Core or Desktop', () => {
  // Regression: app quit interrupted the installing turn before it could return a durable outcome.
  const result = JSON.parse(execFileSync(binary, ['cli', 'app', 'replace', '--status'], { env: environment, encoding: 'utf8' }));
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.result.state, 'none');
});

test('replacement rejects invalid input before contacting an installed app', () => {
  // Contract: CLI errors retain schemaVersion, ok and a machine-readable error code.
  const invalid = spawnSync(binary, ['cli', 'call', 'app.replace', '--stdin'], { env: environment, input: JSON.stringify({ body: { path: 7 } }), encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  const result = JSON.parse(invalid.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.error.code, 'INVALID_ARGUMENT');
});

test('replacement check is discoverable and does not accept relative bundles', { skip: process.platform !== 'darwin' }, () => {
  // Regression: a replacement command could quit its execution owner before validating the staged bundle.
  const invalid = spawnSync(binary, ['cli', 'app', 'replace', 'candidate.app', '--check'], { env: environment, encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).error.code, 'INVALID_ARGUMENT');
});
