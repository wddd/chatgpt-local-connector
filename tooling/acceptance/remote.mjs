import { requireMainCheckout } from '../coding-lane.mjs';
requireMainCheckout();
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i], value = process.argv[i + 1];
  if (!['--host', '--out', '--project'].includes(flag) || !value || options[flag]) throw new Error('Usage: remote.mjs --host <ssh-alias> [--project <remote-directory>] [--out <local-directory>]');
  options[flag] = value;
}
const host = options['--host'];
if (!host || !/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(host)) throw new Error('--host must be an SSH alias');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(options['--out'] ?? path.join(root, 'output/acceptance/remote', new Date().toISOString().replaceAll(':', '-')));
await mkdir(out, { recursive: true });
const report = { schemaVersion: 1, host, startedAt: new Date().toISOString(), steps: [], assertions: [], defects: [], evidenceGaps: [] };
const quote = value => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
async function ssh(command, input = '', timeout = 45000, binary = false) {
  return new Promise((resolve, reject) => {
    const child = execFile('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command], { timeout, maxBuffer: 32 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' }, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); } else resolve(stdout);
    });
    child.stdin.end(input);
  });
}
let cli;
async function call(name, args, body, timeout = 45000) {
  const command = `${quote(cli)} cli ${args.map(quote).join(' ')}`;
  let stdout;
  try { stdout = await ssh(command, body === undefined ? '' : JSON.stringify(body), timeout); }
  catch (error) { if (!error.stdout) throw error; stdout = error.stdout; }
  const envelope = JSON.parse(stdout.trim());
  await writeFile(path.join(out, `${name}.json`), JSON.stringify(envelope, null, 2));
  report.steps.push({ name, ok: envelope.ok === true, artifact: `${name}.json` });
  if (!envelope.ok) {
    const error = new Error(`${name}: ${envelope.error?.code ?? 'COMMAND_FAILED'} ${envelope.error?.message ?? ''}`);
    error.envelope = envelope; throw error;
  }
  return envelope.result;
}
function containsSession(activity, id) { return Object.values(activity?.agents ?? {}).some(a => a.sessions?.some(s => s.id === id || s.nativeSessionId === id)); }
function assertion(name, passed, evidence) {
  const status = passed === null ? 'unknown' : passed ? 'passed' : 'failed';
  report.assertions.push({ name, status, evidence });
  if (status !== 'passed') report[status === 'failed' ? 'defects' : 'evidenceGaps'].push(`${name}: ${evidence}`);
}
const snapshotArtifacts = new Map();
function assertSnapshot() {
  let model;
  try { model = JSON.parse(snapshotArtifacts.get('view-model.json')?.toString('utf8') ?? 'unavailable'); }
  catch (error) { assertion('rendered-task', null, `View model unavailable: ${error.message}`); }
  const ids = [report.threadId, report.taskId].filter(Boolean);
  const tasks = model?.topology?.tasks;
  const matched = Array.isArray(tasks) && ids.length ? tasks.filter(t => ids.includes(t.taskId) || ids.includes(t.threadId)) : null;
  if (model) assertion('rendered-task', matched ? matched.length > 0 : null, matched ? `${matched.length} rendered tasks match dispatched IDs ${ids.join(', ')}` : 'Missing dispatched ID or topology tasks');
  const origins = matched?.map(t => t.origin);
  assertion('rendered-source', origins?.length && origins.every(o => o && (o.ingressId || o.controlSource)) ? origins.every(o => (o.ingressId ?? o.controlSource) === 'local-cli' && (!o.controlSource || o.controlSource === 'local-cli')) : null, JSON.stringify(origins ?? 'No matched task origin'));
  assertion('layout-settled', typeof model?.layoutSettled === 'boolean' ? model.layoutSettled : null, `layoutSettled=${model?.layoutSettled}`);
  try {
    const png = PNG.sync.read(snapshotArtifacts.get('snapshot.png'));
    let sum = 0, squares = 0;
    const count = png.width * png.height;
    for (let i = 0; i < png.data.length; i += 4) {
      const alpha = png.data[i + 3] / 255;
      const luminance = (0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]) * alpha + 255 * (1 - alpha);
      sum += luminance; squares += luminance * luminance;
    }
    const variance = count ? Math.max(0, squares / count - (sum / count) ** 2) : 0;
    assertion('png-nonblank', variance > 1, `${png.width}x${png.height}; luminance variance=${variance.toFixed(4)} (required >1)`);
  } catch (error) { assertion('png-nonblank', null, `Cannot decode PNG: ${error.message}`); }
}
try {
  const platform = (await ssh('uname -s')).trim();
  if (platform !== 'Darwin') throw new Error('Evidence gap: this SSH launcher requires macOS; it never starts a headless daemon');
  cli = (await ssh(`if command -v arc >/dev/null 2>&1; then command -v arc; else for p in '/Applications/Agent Remote Control.app/Contents/Resources/bin/arc' "$HOME/Applications/Agent Remote Control.app/Contents/Resources/bin/arc"; do if [ -x "$p" ]; then printf '%s\\n' "$p"; break; fi; done; fi`)).trim();
  if (!cli.startsWith('/')) throw new Error('Evidence gap: ARC CLI not found; run the App-bundled cli install-shim');
  const started = await call('app-start', ['app', 'start'], undefined, 45000);
  if (!started.executable?.includes('.app/')) throw new Error('Evidence gap: app start did not confirm an App-owned desktop');
  await call('doctor', ['doctor']);
  const capabilities = await call('capabilities', ['capabilities']);
  if (!capabilities.cliOnly?.control || !capabilities.operations?.some(o => o.name === 'app.snapshot')) throw new Error('Evidence gap: target installation does not contain acceptance commands');
  await call('control-guide', ['control', 'guide', 'codex_create']);
  const requestId = randomUUID();
  const receipt = await call('dispatch', ['control', 'codex_create', '--stdin'], {
    requestId, title: 'ARC acceptance', prompt: 'Do not call tools, read files, modify files, or ask questions. Reply with exactly ARC_ACCEPTANCE_OK.',
    mode: 'read-only', approval: 'bypass', waitMs: 1000,
    ...(options['--project'] ? { project: options['--project'] } : {}),
  }, 45000);
  report.requestId = requestId;
  const resolved = receipt.threadId && receipt.turnId ? receipt : (await call('dispatch-wait', ['wait', '--control', '--op', 'receipt', '--stdin', '--until', '/threadId exists', '--until', '/turnId exists', '--timeout', '60'], { requestId }, 70000)).lastResult;
  const id = resolved.threadId;
  report.taskId = resolved.taskId;
  report.threadId = id; report.turnId = resolved.turnId;
  const activityBefore = await call('activity-before', ['call', 'agents.activity']);
  const terminal = await call('task-wait', ['wait', '--control', '--op', 'codex_wait', '--stdin', '--until', '/conditionMet==true', '--timeout', '60'], { threadId: id, turnId: resolved.turnId, until: 'terminal' }, 70000);
  await call('task-read', ['control', 'codex_read', '--stdin'], { threadId: id });
  const response = terminal.lastResult.finalResponse;
  const text = typeof response === 'string' ? response : response?.text;
  if (text?.trim() !== 'ARC_ACCEPTANCE_OK') report.defects.push('Final assistant response is not exactly ARC_ACCEPTANCE_OK');
  report.terminal = terminal.lastResult.state;
  if (report.terminal !== "completed") report.defects.push(`Task ended as ${report.terminal}`);
  const records = await call('tasks', ['call', 'tasks.list']);
  const record = records.records?.find(r => r.requestId === requestId);
  if (!record || record.origin?.ingressId !== 'local-cli') report.defects.push('tasks.list does not contain the dispatched local-cli task');
  const activityAfter = await call('activity-after', ['call', 'agents.activity']);
  if (!containsSession(activityBefore, id) && !containsSession(activityAfter, id)) report.evidenceGaps.push('Task was absent from both activity samples; it may have completed before sampling. Live topology visibility is unproven.');
} catch (error) {
  const message = String(error.message ?? error);
  const code = error.envelope?.error?.code;
  const gap = message.startsWith('Evidence gap:') || /APP_UNAVAILABLE|NOT_SUPPORTED|DESKTOP_UNSUPPORTED|UNKNOWN_OPERATION/.test(code ?? '') || /ENOTFOUND|ETIMEDOUT|Permission denied|Connection refused|Could not resolve hostname/.test(String(error.stderr ?? message));
  report[gap ? 'evidenceGaps' : 'defects'].push(message);
}
// Always try to collect the UI even when dispatch failed; capture failures are
// separate evidence rather than hiding the execution result.
if (cli) {
  try {
    const snapshot = await call('snapshot', ['app', 'snapshot', '--stdin'], { width: 1280, height: 800, panel: { kind: 'none' } }, 50000);
    for (const [remote, local] of [[snapshot.viewModel, 'view-model.json'], [snapshot.png?.path, 'snapshot.png']]) {
      if (remote) {
        const data = await ssh(`cat -- ${quote(remote)}`, '', 30000, true);
        snapshotArtifacts.set(local, data);
        await writeFile(path.join(out, local), data);
      }
    }
    if (!snapshot.png?.ok) report.evidenceGaps.push(`PNG unavailable: ${snapshot.png?.code ?? 'unknown'}`);
  } catch (error) { report.evidenceGaps.push(`Snapshot unavailable: ${error.message}`); }
}
assertSnapshot();
report.finishedAt = new Date().toISOString();
report.ok = report.defects.length === 0 && report.evidenceGaps.length === 0;
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, directory: out, assertions: report.assertions, defects: report.defects, evidenceGaps: report.evidenceGaps }));
process.exitCode = report.defects.length ? 1 : report.evidenceGaps.length ? 2 : 0;
