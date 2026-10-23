import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

if (spawnSync('cargo', ['mutants', '--version'], { stdio: 'ignore' }).status !== 0) {
  console.error('cargo-mutants is not installed. Install with cargo install --locked cargo-mutants when disk budget permits; see docs/dev/testing.md.');
  process.exit(1);
}
const modules = process.argv.slice(2);
const allowed = ['waiter', 'wait_transport', 'claude_notify', 'control_sources', 'dispatch_policy'];
if (!modules.length || modules.some(name => !allowed.includes(name))) {
  console.error(`Choose one or more core modules: ${allowed.join(', ')}.`);
  process.exit(1);
}
// Resolve the existing target symlink so temporary copies stay on the cache volume.
mkdirSync('target', { recursive: true });
const cache = path.join(realpathSync('target'), 'mutation-native');
mkdirSync(cache, { recursive: true });
const result = spawnSync('cargo', ['mutants', '--manifest-path', 'Cargo.toml', '--package', 'arc-core', '--jobs', '1',
  '--output', cache, ...modules.flatMap(name => ['--file', `native/src/${name}.rs`]), '--', '--lib'], {
  stdio: 'inherit', env: { ...process.env, TMPDIR: cache, TMP: cache, TEMP: cache },
});
const prune = spawnSync(process.execPath, ['tooling/prune-build-cache.mjs'], { stdio: 'inherit' });
process.exit(result.status === 0 ? (prune.status ?? 1) : (result.status ?? 1));
