import { build } from 'vite';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildNative } from './build-native.mjs';
import { stageTimer } from './release-support.mjs';
const timed = (name, operation) => process.env.ARC_RELEASE_TIMINGS_FILE ? stageTimer().run(name, operation) : operation();
// Node is a build tool only. The installed application contains Rust + static UI.
await rm(new URL('../desktop/runtime/', import.meta.url), { recursive: true, force: true });
await timed('frontend build', () => build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) }));

const args = process.argv.slice(2);
const targetArg = args.find(a => a === '--target' || a.startsWith('--target='));
const target = targetArg === '--target' ? args[args.indexOf(targetArg) + 1] : targetArg?.slice('--target='.length);
await timed('Rust Core build/sign', () => buildNative({ release: !args.some(a => a === '--debug' || a === '-d'), target, bundled: true }));
