import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enterHeavyBuild } from './heavy-build.mjs';

enterHeavyBuild();
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
try {
  run('tooling/build-native.mjs');
  run('tooling/build-native.mjs', '--check');
} finally {
  run('tooling/prune-build-cache.mjs', '--keep=target/debug');
}
