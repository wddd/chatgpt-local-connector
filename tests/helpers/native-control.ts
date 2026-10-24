import {assertNextCalls} from './continuations.ts';
import {promisify} from 'node:util';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function nativeControl(script: string, extraEnv: Record<string, string> = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'arc-control-'));
  if (extraEnv.ARC_DEV_INSTANCE_ID) {
    await mkdir(path.join(directory, "state"));
    await writeFile(path.join(directory, "state/acceptance-instance.json"), JSON.stringify({instanceId:extraEnv.ARC_DEV_INSTANCE_ID}));
  }
  const fixture = path.join(directory, 'server.mjs');
  await writeFile(fixture, script);
  const target = process.env.CARGO_TARGET_DIR || path.resolve('target');
  execFileSync('cargo', ['build', '--locked', '--quiet', '-p', 'contract-fixture', '--target-dir', target], { stdio: 'inherit' });
  const processHandle = spawn(path.join(target, 'debug', `contract-fixture${process.platform === 'win32' ? '.exe' : ''}`), ['http'], {
    env: { ...process.env, ARC_STATE_DIR: path.join(directory, 'state'), ARC_FIXTURE_SCRIPT: fixture, ARC_FIXTURE_BINARY: process.execPath, ...extraEnv }, stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: processHandle.stdout });
  const endpoint = JSON.parse((await lines[Symbol.asyncIterator]().next()).value!);
  const api = async (route: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/api/${route}`, {
      method, headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.json() as Promise<any>;
  };
  const call = async (op: string, args: Record<string, unknown> = {}) => {
    const value = await api('cli/control', { op, args });
    assertNextCalls(value.structuredContent);
    return value.structuredContent?.result ?? value;
  };
  const completed = async (op: string, args: Record<string, unknown> = {}) => {
    let result = await call(op, { purpose: 'self-test', notify: null, ...args });
    const deadline = Date.now() + 10000;
    while (['pending', 'reserved', 'submitting', 'turn-submitting', 'thread-submitting', 'thread-created'].includes(result.state)) {
      if (Date.now() > deadline) throw new Error('Fixture receipt did not finish');
      await new Promise(resolve => setTimeout(resolve, 20));
      result = await call('receipt', { requestId: result.requestId });
    }
    return result;
  };
  const shell = async (command: string) => {
    const binary=path.join(target,'debug',process.platform === 'win32' ? 'contract-fixture.exe' : 'contract-fixture');
    const quoted="'"+binary.replaceAll("'","'\\''")+"'";
    return promisify(execFile)('/bin/sh',['-c',command.replace('arc cli',`${quoted} cli`)],{env:{...process.env,ARC_STATE_DIR:path.join(directory,'state')}});
  };
  return { api, call, completed, shell, async close() {
    processHandle.stdin.end('\n');
    await new Promise<void>(resolve => processHandle.once('exit', () => resolve()));
    lines.close(); await rm(directory, { recursive: true, force: true });
  } };
}
