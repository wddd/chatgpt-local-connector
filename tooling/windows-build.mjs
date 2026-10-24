// Runs only in the dedicated clean Windows release checkout. No signing keys.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileDigest, stageTimer, dependencyEnv } from './release-support.mjs';
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 worker required');
if (Object.keys(process.env).some(key => /^(TAURI_SIGNING_|CSC_|WIN_CSC_)/.test(key))
    || existsSync(path.join(homedir(), '.tauri/agent-remote-control.key'))) throw new Error('Signing secrets must not be present on the Windows worker');
const run = (file, args) => execFileSync(file, args, { stdio: 'inherit' });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Windows source checkout is dirty');
const sourceSha = git('rev-parse', 'HEAD');
const version = process.env.ARC_BUILD_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('ARC_BUILD_VERSION must be x.y.z');
const output = path.resolve('release-artifacts/windows');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// SSH does not inherit the interactive Rust/MSVC developer shell.
process.env.PATH = `${path.join(homedir(), '.cargo/bin')};${process.env.PATH}`;
const vswhere = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe');
const installation = execFileSync(vswhere, ['-latest', '-products', '*', '-requires',
  'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
if (!installation) throw new Error('Windows worker requires Visual Studio C++ x64 build tools');
const setup = path.join(output, 'toolchain.cmd');
try {
  await writeFile(setup, `@echo off\r\ncall "${installation}\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul\r\nif errorlevel 1 exit /b %errorlevel%\r\nset\r\n`);
  const values = execFileSync('cmd.exe', ['/d', '/c', setup], { encoding: 'utf8' });
  for (const line of values.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator > 0) process.env[line.slice(0, separator)] = line.slice(separator + 1);
  }
} finally { await rm(setup, { force: true }); }
process.env.ARC_RELEASE_TIMINGS_FILE = path.join(output, 'windows-stages.jsonl');
process.env.ARC_RELEASE_PLATFORM = 'windows';
const timer = stageTimer();
await timer.run('Windows dependencies', async () => execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm ci'], { stdio: 'inherit', env: dependencyEnv(process.env) }));
await rm('target/x86_64-pc-windows-msvc/release/bundle', { recursive: true, force: true });
await timer.run('Windows desktop build', async () => run(process.execPath, ['tooling/desktop-build.mjs', '--unsigned-updater', '--target', 'x86_64-pc-windows-msvc']));
if (git('status', '--porcelain') || git('rev-parse', 'HEAD') !== sourceSha) throw new Error('Windows build changed source');
const binary = await readFile('target/x86_64-pc-windows-msvc/release/agent-remote-control-desktop.exe');
const pe = binary.readUInt32LE(0x3c);
if (binary.toString('ascii', pe, pe + 4) !== 'PE\0\0' || binary.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Windows binary must be x86_64 PE');
const coreVersion = execFileSync('target/x86_64-pc-windows-msvc/release/arc.exe', ['--version'], { encoding: 'utf8' }).trim();
if (coreVersion !== version) throw new Error('Windows Core embedded version mismatch');
const file = `agent-remote-control_${version}_x64-setup.exe`;
await copyFile(`target/x86_64-pc-windows-msvc/release/bundle/nsis/Agent Remote Control_${version}_x64-setup.exe`, path.join(output, file));
await writeFile(path.join(output, 'windows-receipt.json'), JSON.stringify({ version, sourceSha, arch: 'x86_64', file,
  sha256: (await fileDigest(path.join(output, file))).slice(7) }, null, 2) + '\n');
