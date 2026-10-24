import { spawn } from 'node:child_process';
import { testInputs, recordTestPass, testEnvironment } from './test-cache.mjs';
const before = await testInputs();
const env = testEnvironment();
const run = (file, args) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('close', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});
try {
  await run('cargo', ['test', '--locked', '--manifest-path', 'native/Cargo.toml', '--lib']);
  await run(process.execPath, ['--test', 'tests/control-mcp.test.ts', 'tests/activity-ui.test.ts', 'tests/topology.test.ts',
    'tests/topology-render.test.ts', 'tests/updates.test.ts', 'tests/release.test.mjs']);
} finally { await run(process.execPath, ['tooling/prune-build-cache.mjs', '--keep=target/debug']); }
await recordTestPass(before);
