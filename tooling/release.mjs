import { readFile, writeFile, readdir, mkdir, copyFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseSigningEnv } from './release-signing.mjs';
import { macosSigningIdentity } from './macos-signing.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
let version = pkg.version;
const repo = 'whzxc/chatgpt-local-connector';
const base = `https://github.com/${repo}/releases/download/v${version}`;
const config = JSON.parse(await readFile('desktop/tauri.conf.json', 'utf8'));
const [mode, ...args] = process.argv.slice(2);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(file)); else out.push(file);
  }
  return out;
}
function verifySignatures(artifacts) {
  execFileSync('cargo', ['run', '--quiet', '--locked', '--manifest-path', 'tooling/verifier/Cargo.toml', '--', 'desktop/tauri.conf.json', ...artifacts], { stdio: 'inherit' });
}
async function validateManifest(manifest, dir, keys = Object.keys(manifest.platforms)) {
  if (manifest.version !== version || !manifest.platforms['darwin-aarch64']) throw new Error('Invalid release manifest');
  for (const key of keys) {
    const value = manifest.platforms[key];
    if (!value.url.startsWith(base + '/')) throw new Error('Unexpected updater download origin/version');
    const name = value.url.slice(base.length + 1);
    if (name !== path.basename(name) || !/\.(gz|exe)$/.test(name)) throw new Error('Invalid updater asset name');
    if ((await readFile(path.join(dir,name+'.sig'),'utf8')).trim() !== value.signature) throw new Error('Manifest signature mismatch');
    await readFile(path.join(dir,name));
  }

}
async function check() {
  parts(version);
  if (config.version !== version) throw new Error('Tauri version mismatch');
  for (const file of ['native/Cargo.toml', 'desktop/Cargo.toml']) {
    if (!(await readFile(file, 'utf8')).includes(`version = "${version}"`)) throw new Error(`${file}: version mismatch`);
  }
  const lock = await json('package-lock.json');
  if (lock.version !== version || lock.packages[''].version !== version) throw new Error('package-lock version mismatch');
  for (const [file, name] of [['native/Cargo.lock','connector-core'],['desktop/Cargo.lock','connector-core'],['desktop/Cargo.lock','local-connector-desktop']]) {
    if (!(await readFile(file,'utf8')).includes(`name = "${name}"\nversion = "${version}"`)) throw new Error(`${file}: ${name} version mismatch`);
  }
  console.log(`Release configuration ready: v${version}, ${repo}`);
}
async function cask(dir) {
  const dmg = (await files(dir)).filter(f => f.endsWith('_aarch64.dmg'));
  if (dmg.length !== 1) throw new Error('Expected one Apple Silicon DMG');
  await writeFile(path.join(dir, 'local-connector.rb'), `cask "local-connector" do
  version "${version}"
  sha256 "${hash(await readFile(dmg[0]))}"

  url "https://github.com/${repo}/releases/download/v#{version}/Local.Connector_#{version}_aarch64.dmg"
  name "Local Connector"
  desc "Connect ChatGPT to local Codex Desktop"
  homepage "https://github.com/${repo}"
  depends_on arch: :arm64
  auto_updates true
  app "Local Connector.app"

  caveats <<~EOS
    See the repository installation guide if macOS blocks the first launch.
    Codex Desktop and a ChatGPT connection are required.
    Choose OpenAI Secure MCP Tunnel or HTTPS MCP in the application.
  EOS
end
`);
}
const releaseFiles = ['package.json','package-lock.json','desktop/tauri.conf.json','native/Cargo.toml','desktop/Cargo.toml','native/Cargo.lock','desktop/Cargo.lock','CHANGELOG.md'];
const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
function parts(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error(`Invalid stable version: ${value}`);
  return value.split('.').map(BigInt);
}
function compare(a, b) {
  const x=parts(a), y=parts(b);
  for (let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]>y[i]?1:-1;
  return 0;
}
function latestPublished() {
  const tags=execFileSync('gh',['api',`repos/${repo}/releases`,'--paginate','--jq','.[] | select(.draft == false and .prerelease == false) | .tag_name'],{encoding:'utf8'}).trim();
  return tags ? tags.split('\n').map(tag=>tag.replace(/^v/,'')).sort(compare).at(-1) : undefined;
}
function changesSince(previous) {
  const range=previous ? `refs/tags/v${previous}..HEAD` : 'HEAD';
  if(previous) {
    git('rev-parse','--verify',`refs/tags/v${previous}`);
    git('merge-base','--is-ancestor',`refs/tags/v${previous}`,'HEAD');
  }
  const messages=git('log','--no-merges','--format=%s',range);
  if(!messages) throw new Error('No changes since the published release');
  return messages.split('\n').map(subject=>`- ${subject}`).join('\n');
}
async function notes() {
  const changelog=await readFile('CHANGELOG.md','utf8');
  const entry=changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]?.trim();
  if(entry) return entry;
  const previous=latestPublished();
  return changesSince(previous);
}
async function sync() {
  config.version = version; await writeJson('desktop/tauri.conf.json', config);
  const lock = await json('package-lock.json'); lock.version = version; lock.packages[''].version = version; await writeJson('package-lock.json',lock);
  for (const file of ['native/Cargo.toml','desktop/Cargo.toml']) await writeFile(file,(await readFile(file,'utf8')).replace(/^version = "[^"]+"/m,`version = "${version}"`));
  for (const file of ['native/Cargo.lock','desktop/Cargo.lock']) await writeFile(file,(await readFile(file,'utf8')).replace(/(name = "(?:connector-core|local-connector-desktop)"\nversion = ")[^"]+/g,(_, prefix) => prefix + version));
  await check();
}
async function prepare(options = args) {
  if(options.some(arg=>arg!=='--dry-run')) throw new Error('prepare [--dry-run]');
  parts(version);
  const previous=latestPublished();
  const bump=previous && compare(version,previous)<=0;
  const target=bump ? [...parts(previous).slice(0,2),parts(previous)[2]+1n].join('.') : version;
  console.log(`Published: ${previous ?? 'none'}; current: ${version}; target: ${target}; release commits: ${bump?1:0}`);
  if(options.includes('--dry-run')) return;
  if(git('status','--porcelain')) throw new Error('Commit or set aside existing changes before release preparation');
  if(!bump) { await check(); return; }
  const changes=changesSince(previous);
  const changelog=await readFile('CHANGELOG.md','utf8');
  version=target; pkg.version=target;
  await writeJson('package.json',pkg);
  const entry=`## ${version}\n\n${changes}\n\n`;
  if(!changelog.includes(`## ${version}\n`)) await writeFile('CHANGELOG.md',/^## /m.test(changelog)?changelog.replace(/(?=^## )/m,entry):changelog.trimEnd()+'\n\n'+entry);
  await sync();
  git('add','--',...releaseFiles);
  git('commit','-m',`chore(release): 更新版本至 ${version}`,'--',...releaseFiles);
}
if (mode === 'release') {
  if (args.some(arg => !['--skip-tests', '--dry-run', '--ci'].includes(arg))) throw new Error('release [--dry-run | --ci] [--skip-tests]');
  const dryRun = args.includes('--dry-run');
  const ci = args.includes('--ci');
  if (ci && dryRun) throw new Error('--ci 与 --dry-run 不能同时使用');
  if (!ci && (process.platform !== 'darwin' || process.arch !== 'arm64')) throw new Error('本地发布需要 Apple Silicon Mac；其他主机请使用 --ci');
  // Fail before prepare or compilation, and pass credentials only in the environment.
  const env = ci ? process.env : releaseSigningEnv(true);
  if (!ci) macosSigningIdentity(env);
  const run = (script, ...options) => execFileSync(process.execPath, [script, ...options], { env, stdio: 'inherit' });
  if (!dryRun) {
    if (git('branch', '--show-current') !== 'main') throw new Error('Run release from main');
    if (git('status', '--porcelain')) throw new Error('Commit or set aside existing changes before release');
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    git('fetch', 'origin', 'main', '--tags');
    git('merge-base', '--is-ancestor', 'origin/main', 'HEAD');
    await prepare([]);
    if (git('tag', '--list', `v${version}`)) throw new Error(`Tag v${version} already exists; inspect the previous release attempt before retrying`);
    if (!args.includes('--skip-tests')) execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], { stdio: 'inherit', shell: process.platform === 'win32' });
  } else await check();
  let output;
  if (!ci) {
    run('tooling/desktop-build.mjs', '--release', '--target', 'aarch64-apple-darwin');
    await mkdir('release-artifacts', { recursive: true });
    output = await mkdtemp(path.join('release-artifacts', `v${version}-`));
    // Child processes reread the prepared version before generating URLs and notes.
    run('tooling/release.mjs', 'stage', 'darwin-aarch64', 'target/aarch64-apple-darwin/release/bundle', output);
    run('tooling/release.mjs', 'finalize', output);
    console.log(`Release artifacts: ${path.resolve(output)}`);
  }
  if (!dryRun) {
    git('tag', `v${version}`);
    git('push', '--atomic', 'origin', 'main', `refs/tags/v${version}`);
    if (ci) execFileSync('gh', ['workflow', 'run', 'release.yml', '--ref', 'main', '-f', `tag=v${version}`], { stdio: 'inherit' });
    else {
      const assets = (await files(output)).filter(file => path.basename(file) !== 'darwin-aarch64.json');
      execFileSync('gh', ['release', 'create', `v${version}`, ...assets, '--verify-tag', '--notes-file', path.join(output, 'release-notes.md'), '--latest'], { stdio: 'inherit' });
    }
  }
} else if (mode === 'prepare') await prepare();
else if (mode === 'sync') await sync();
else if (mode === 'stage') {
  const [target, input, output] = args;
  if (!['darwin-aarch64','windows-x86_64'].includes(target) || !input || !output) throw new Error('stage <darwin-aarch64|windows-x86_64> <bundle-dir> <output-dir>');
  await mkdir(output,{recursive:true});
  if ((await readdir(output)).length) throw new Error('Stage directory must be empty; use a fresh directory');
  const candidates = (await files(input)).filter(f => target === 'darwin-aarch64'
    ? f.endsWith(`_${version}_aarch64.dmg`) || /\.app\.tar\.gz(?:\.sig)?$/.test(f)
    : path.basename(f).includes(`_${version}_`) && /\.exe(?:\.sig)?$/.test(f));
  for (const file of candidates) {
    let name = path.basename(file).replaceAll(' ','.');
    if (target === 'darwin-aarch64' && name.includes('.app.tar.gz')) name = name.replace('.app.tar.gz', `_${version}_aarch64.app.tar.gz`);
    await copyFile(file,path.join(output,name));
  }
  const staged = await files(output);
  const payloads = staged.filter(f => target === 'darwin-aarch64' ? f.endsWith('.app.tar.gz') : /\.exe$/.test(f));
  if (payloads.length !== 1) throw new Error('Missing/duplicate updater bundles');
  if (target === 'darwin-aarch64' && staged.filter(f=>f.endsWith('_aarch64.dmg')).length !== 1) throw new Error('Missing Apple Silicon DMG');
  const platforms = {};
  for (const file of payloads) {
    const value = { signature:(await readFile(file+'.sig','utf8')).trim(), url:`${base}/${path.basename(file)}` };
    const keys = target === 'darwin-aarch64' ? ['darwin-aarch64'] : ['windows-x86_64','windows-x86_64-nsis'];
    for (const key of keys) platforms[key] = value;
  }
  await writeJson(path.join(output,`${target}.json`), { version, platforms });
  console.log(`Staged ${target} artifacts for metadata generation.`);
} else if (mode === 'finalize' || mode === 'merge-windows') {
  const [dir] = args;
  if (!dir) throw new Error(`${mode} <artifact-dir>`);
  const windows = mode === 'merge-windows';
  const fragment = await json(path.join(dir, windows ? 'windows-x86_64.json' : 'darwin-aarch64.json'));
  if (fragment.version !== version) throw new Error('Mixed release versions');
  const manifest = windows ? await json(path.join(dir, 'latest.json')) : {
    version, notes: await notes(), pub_date: new Date().toISOString(), platforms: {},
  };
  Object.assign(manifest.platforms, fragment.platforms);
  await validateManifest(manifest, dir, Object.keys(fragment.platforms));
  const payloads = [...new Set(Object.values(fragment.platforms).map(value => path.join(dir, value.url.slice(base.length + 1))))];
  verifySignatures(payloads);
  if (!windows) {
    await writeFile(path.join(dir, 'release-notes.md'), manifest.notes + '\n');
    await cask(dir);
  }
  const sumsFile = path.join(dir, 'SHA256SUMS.txt');
  const sums = new Map();
  if (windows) {
    for (const line of (await readFile(sumsFile, 'utf8')).trim().split('\n')) {
      const [, digest, name] = line.match(/^([a-f0-9]{64})  (.+)$/) ?? [];
      if (!name) throw new Error('Invalid SHA256SUMS entry');
      // Replace all previous Windows checksums, including renamed installers.
      if (!/\.exe(?:\.sig)?$/.test(name)) sums.set(name, digest);
    }
  }
  await writeJson(path.join(dir, 'latest.json'), manifest);
  const assets = (await files(dir)).filter(f => /\.(dmg|exe|gz|sig)$/.test(f) || ['local-connector.rb', 'latest.json', 'release-notes.md'].includes(path.basename(f)));
  for (const file of assets) sums.set(path.basename(file), hash(await readFile(file)));
  await writeFile(sumsFile, [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([name, digest]) => `${digest}  ${name}`).join('\n') + '\n');
  console.log(windows ? 'Windows metadata merged; existing macOS entries preserved.' : 'macOS release metadata generated.');
} else throw new Error('Expected release, prepare, sync, stage, finalize, or merge-windows');
