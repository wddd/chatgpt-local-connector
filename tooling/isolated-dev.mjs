import { randomBytes } from 'node:crypto';
import { developmentConfig } from './dev-identity.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readCore, coreRequest } from './dev-core.mjs';

// Always allocate new state: never hand the development supervisor an installed instance.
if (process.argv.length !== 2) throw new Error('Usage: npm run dev:isolated. A new state directory is allocated automatically.');
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Desktop isolation requires macOS or Windows; use ARC_STATE_DIR with headless arc start on Linux.');
const root = fileURLToPath(new URL('../', import.meta.url));
const stateDirectory = await realpath(await mkdtemp(path.join(tmpdir(), 'arc-isolated-')));
const env = { ...process.env, ARC_STATE_DIR: stateDirectory, ARC_DEV_INSTANCE_ID: randomBytes(6).toString('hex') };
const identity = developmentConfig(env);
console.log(JSON.stringify({ event: 'isolated-starting', stateDirectory, bundleId: identity.identifier, appName: identity.productName }));
const child = spawn(process.execPath, [path.join(root, 'tooling/desktop-dev.mjs')], { cwd: root, env, stdio: 'inherit' });
let ended = false;
const done = new Promise(resolve => {
  child.once('error', error => { ended = true; console.error(error.message); resolve(1); });
  child.once('exit', code => { ended = true; resolve(code ?? 1); });
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!ended) child.kill(signal); });
try {
  // The existing development supervisor owns signing, rebuilding and cleanup.
  // Read both Core and Desktop before advertising a usable acceptance endpoint.
  while (!ended) {
    try {
      const endpoint = await readCore(stateDirectory);
      if (endpoint) {
        const desktop = await coreRequest(endpoint, 'app');
        const relative = path.relative(path.join(root, 'target'), desktop.executable || '');
        if (!desktop.executable || relative.startsWith('..') || path.isAbsolute(relative)) {
          child.kill('SIGTERM');
          throw new Error('Isolated Desktop identity is outside this checkout target directory.');
        }
        console.log(JSON.stringify({ event: 'isolated-ready', stateDirectory, port: endpoint.port, instance: endpoint.instance,
          desktopPid: desktop.pid, corePid: endpoint.pid, screen: { action: 'tree', bundleId: identity.identifier, pid: desktop.pid }, bundleId: identity.identifier, appName: identity.productName,
          cli: [path.join(root, 'dist/native', process.platform === 'win32' ? 'arc.exe' : 'arc'), 'cli', '--state-dir', stateDirectory] }));
        break;
      }
    } catch (error) {
      if (error.message.startsWith('Isolated Desktop identity')) throw error;
      // Startup can publish Core metadata before Desktop attaches.
    }
    await delay(250);
  }
  process.exitCode = await done;
} catch (error) {
  console.error(error.message);
  if (!ended) child.kill('SIGTERM');
  await done.catch(() => {});
  process.exitCode = 1;
}
// State remains available for inspection. No installed state or artifacts are replaced.
