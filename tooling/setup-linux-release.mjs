// Local release prerequisites only; no service, tag, or publication changes.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runCommand } from './windows-release.mjs';
import { fileDigest } from './release-support.mjs';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Local Linux releases require an Apple Silicon Mac');
const root = process.cwd(), tools = path.resolve('release-artifacts/.linux-tools');
await mkdir(tools, { recursive: true });
if (!existsSync(path.join(tools, 'bin/python'))) await runCommand('uv', ['venv', tools]);
await runCommand('uv', ['pip', 'install', '--python', path.join(tools, 'bin/python'), 'cargo-zigbuild==0.24.0', 'ziglang==0.17.0']);
await runCommand('rustup', ['target', 'add', 'x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu']);
const lima = path.join(tools, 'lima');
await mkdir(lima, { recursive: true });
const archive = path.join(lima, 'lima-2.2.1-Darwin-arm64.tar.gz');
if (!existsSync(archive)) await runCommand('gh', ['release', 'download', 'v2.2.1', '--repo', 'lima-vm/lima',
  '--pattern', path.basename(archive), '--dir', lima]);
if (await fileDigest(archive) !== 'sha256:9e9eacce88f37e185c346bad73aa6136f738d8cdf8c3bb23cd42b071824bc66e') throw new Error('Lima archive checksum mismatch');
if (!existsSync(path.join(lima, 'bin/limactl'))) await runCommand('tar', ['-xzf', archive, '-C', lima]);
const env = { ...process.env, LIMA_HOME: path.resolve('release-artifacts/.l') };
const limactl = path.join(lima, 'bin/limactl');
const mount = path.resolve('release-artifacts/.linux-validation');
await mkdir(mount, { recursive: true });
// Rosetta must already be installed through macOS. This does not accept a license.
if (!existsSync('/Library/Apple/usr/libexec/oah/libRosettaRuntime')) throw new Error('Install Rosetta through macOS before setting up the Linux x64 validator');
await runCommand(limactl, existsSync(path.join(env.LIMA_HOME, 'arc/lima.yaml')) ? ['start', '--tty=false', 'arc'] :
  ['start', '--name', 'arc', '--vm-type', 'vz', '--cpus', '2', '--memory', '2', '--disk', '10',
    '--containerd', 'none', '--rosetta', '--mount-only', mount, '--tty=false', 'template:ubuntu-24.04'], { env });
await runCommand(limactl, ['shell', 'arc', '--', 'sudo', 'sh', '-c',
  'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libc6-amd64-cross libgcc-s1-amd64-cross binutils'], { env });
console.log(`Linux release tools ready under ${path.relative(root, tools)}. The project VM mounts only ${mount}.`);
