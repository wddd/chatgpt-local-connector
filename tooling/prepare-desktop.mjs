import { build } from 'vite';
import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { syncDirectory } from './build-cache.mjs';
import { stageTimer } from './release-support.mjs';
const timed = (name, operation) => process.env.ARC_RELEASE_TIMINGS_FILE ? stageTimer().run(name, operation) : operation();
// Node is a build tool only. The installed application contains Rust + static UI.
await rm(new URL('../desktop/runtime/', import.meta.url), { recursive: true, force: true });
await timed('frontend build', async () => {
  const staging = fileURLToPath(new URL('../target/frontend-stage', import.meta.url));
  await build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)), build: { outDir: staging } });
  await syncDirectory(staging, fileURLToPath(new URL('../dist/ui', import.meta.url)));
});
await mkdir(new URL('../dist/native/', import.meta.url), { recursive: true });
