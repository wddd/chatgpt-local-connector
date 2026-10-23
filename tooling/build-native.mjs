import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildEnv } from './build-env.mjs';
import { macosSigningIdentity, macosSigningArgs } from './macos-signing.mjs';

export async function buildNative({ release = false, target, bundled = release, developmentDesktop = false } = {}) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  if (release && !target) target = process.platform === 'darwin' ? 'aarch64-apple-darwin' : process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : undefined;
  const args = ['build', '--locked', '--manifest-path', 'desktop/Cargo.toml', ...(developmentDesktop ? ['--bins'] : ['--bin', 'arc']), '--features', bundled ? 'core-bin,tauri/custom-protocol' : 'core-bin'];
  if (release) args.push('--release');
  if (target) args.push('--target', target);
  const env = buildEnv(release);
  const identity = macosSigningIdentity(env, { release });
  // The Core is itself a desktop resource, so its build must not copy resources
  // that have not been produced yet (notably on a clean Actions checkout).
  const config = developmentDesktop ? JSON.parse(await readFile(path.join(root, 'desktop/tauri.dev.conf.json'), 'utf8')) : {};
  env.TAURI_CONFIG = JSON.stringify({ ...config, version: env.ARC_BUILD_VERSION, bundle: { ...config.bundle, resources: [] } });
  execFileSync(process.execPath, [path.join(root, 'tooling/prune-build-cache.mjs'), `--keep=target/${target || (release ? 'release' : 'debug')}`], { cwd: root, stdio: 'inherit' });
  try { execFileSync('cargo', args, { cwd: root, env, stdio: 'inherit' }); }
  finally {
    execFileSync(process.execPath, [path.join(root, 'tooling/prune-build-cache.mjs'), `--keep=target/${target || (release ? 'release' : 'debug')}`], { cwd: root, stdio: 'inherit' });
  }
  const name = process.platform === 'win32' ? 'arc.exe' : 'arc';
  const binary = path.join(root, 'target', ...(target ? [target] : []), release ? 'release' : 'debug', name);
  if (process.platform === 'darwin') execFileSync('codesign', [
    ...macosSigningArgs(identity, 'com.whzxc.agent-remote-control.core'), binary,
  ], { env, stdio: 'inherit' });
  const destination = path.join(root, 'dist/native', name);
  await rm(path.dirname(destination), { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(binary, destination);
  if (process.platform === 'darwin') {
    const helper = path.join(root, 'dist/native/arc-screen');
    execFileSync('xcrun', ['swiftc', '-O', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos11.0`, path.join(root, 'native/screen/main.swift'), '-o', helper], { env, stdio: 'inherit' });
    execFileSync('codesign', [...macosSigningArgs(identity, 'com.whzxc.agent-remote-control.screen'), helper], { env, stdio: 'inherit' });
  }
  return binary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const targetArg = args.find(a => a === '--target' || a.startsWith('--target='));
  const target = targetArg === '--target' ? args[args.indexOf(targetArg) + 1] : targetArg?.slice('--target='.length);
  if (targetArg && !target) throw new Error('--target requires a target triple');
  try { await buildNative({ release: args.includes('--release'), target, developmentDesktop: args.includes('--dev-desktop') }); }
  catch (error) { console.error(`Native build failed: ${error.status ? `exit ${error.status}` : error.message}`); process.exitCode = 1; }
}
