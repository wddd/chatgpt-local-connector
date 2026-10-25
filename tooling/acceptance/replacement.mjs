import '../main-checkout-only.mjs';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, rename, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Use a signed 0.0.0 fixture built with tauri-plugin-single-instance/semver.
// All app mutations and lifecycle requests use disposable bundles and state.
const source = path.resolve(process.argv[2] ?? '');
const execute = promisify(execFile);
const version = (await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(source, 'Contents/Info.plist')])).stdout.trim();
assert.equal(version, '0.0.0', 'Use the isolated semver fixture, never the installed app');
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'arc-replacement-acceptance-')));
const target = path.join(temporary, 'Installed.app');
const candidate = path.join(temporary, 'Candidate.app');
const state = path.join(temporary, 'state');
const env = { ...process.env, ARC_STATE_DIR: state };
const out = path.resolve('output/acceptance', `replacement-${Date.now()}`);
await mkdir(out, { recursive: true });
const report = { temporary, cases: [] }, receipts = [];
let running;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cli(...args) {
  const { stdout } = await execute(path.join(candidate, 'Contents/Resources/bin/arc'), ['cli', ...args], { env, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  const value = JSON.parse(stdout);
  assert.equal(value.ok, true, JSON.stringify(value.error));
  return value.result;
}
async function until(read, accept, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { last = await read(); if (accept(last)) return last; } catch (error) { last = String(error); }
    await sleep(200);
  }
  throw new Error(`Timed out: ${JSON.stringify(last)}`);
}
async function submit(...flags) {
  const receipt = await cli('app', 'replace', candidate, ...flags);
  receipts.push(receipt);
  assert.equal(receipt.replacementReceipt, true);
  assert.equal(receipt.backupReady, true);
  assert.ok(!receipt.backup.startsWith(path.dirname(target) + path.sep));
  await access(receipt.backup);
  return receipt;
}
const read = receipt => async () => JSON.parse(await readFile(receipt.statusPath, 'utf8'));
async function terminal(receipt, expected) {
  const result = await until(read(receipt), v => ['succeeded', 'cancelled', 'failed', 'rolled-back'].includes(v.state));
  assert.equal(result.state, expected, JSON.stringify(result));
  assert.equal(result.notificationError, null);
  const app = await cli('app', 'status'), health = await cli('call', 'health');
  assert.equal(app.executable, path.join(target, 'Contents/MacOS/agent-remote-control-desktop'));
  const fingerprints = expected === 'succeeded' ? receipt.package : receipt.oldPackage;
  assert.equal(app.build, fingerprints.desktopBuild);
  assert.equal(health.build, fingerprints.coreBuild);
  await access(receipt.backup);
  return result;
}
async function regression(name, run) {
  console.log(`START ${name}`);
  const result = await run();
  report.cases.push({ name, result });
  console.log(`PASS ${name}`);
}
try {
  await execute('/usr/bin/ditto', [source, target]);
  await execute('/usr/bin/ditto', [source, candidate]);
  running = spawn(path.join(target, 'Contents/MacOS/agent-remote-control-desktop'), ['--state-dir', state], { env, stdio: 'ignore' });
  await until(() => cli('app', 'status'), app => app.executable === path.join(target, 'Contents/MacOS/agent-remote-control-desktop'));
  await regression('normal replacement reports a restart deadline and verifies recovery', async () => {
    // Regression: local replacement exposed only an acceptance receipt and no visible countdown.
    const receipt = await submit();
    const countdown = await until(read(receipt), value => value.state === 'countdown');
    assert.ok(Date.parse(countdown.restartAt) > Date.now());
    assert.equal((await cli('app', 'status')).pid, receipt.desktopPid);
    return terminal(receipt, 'succeeded');
  });
  await regression('immediate replacement skips idle waiting and countdown', async () => {
    // Regression: explicit local replacement waited for unrelated task activity instead of proceeding.
    const receipt = await submit('--now');
    assert.equal(receipt.immediate, true);
    const result = await terminal(receipt, 'succeeded');
    assert.equal(result.waiting, undefined);
    assert.equal(result.restartAt, undefined);
    return result;
  });
  await regression('an invalid installed bundle restores the temporary-directory backup', async () => {
    // Regression: moving backups off the installation filesystem must preserve verified rollback.
    const receipt = await submit();
    await until(read(receipt), value => value.state === 'countdown');
    const executable = path.join(receipt.staged, 'Contents/MacOS/agent-remote-control-desktop');
    await rename(executable, executable + '.disabled');
    return terminal(receipt, 'rolled-back');
  });
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error);
  process.exitCode = 1;
} finally {
  if (report.ok) {
    const app = await cli('app', 'status'), health = await cli('call', 'health');
    await cli('app', 'quit');
    await until(async () => [app.pid, health.pid].every(pid => { try { process.kill(pid, 0); return false; } catch { return true; } }), Boolean);
    await rm(temporary, { recursive: true });
    for (const receipt of receipts) await rm(receipt.temporaryDirectory, { recursive: true, force: true });
  }
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, directory: out, error: report.error }));
}
