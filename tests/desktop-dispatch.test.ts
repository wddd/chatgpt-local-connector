import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeControl } from './helpers/native-control.ts';

test('Desktop and connector owners dispatch FIFO and steer only a confirmed native turn', { skip: process.platform !== 'darwin' }, async () => {
  // Regression: Desktop optimistic turns caused NO_ACTIVE_TURN, follower steering timeouts and FIFO THREAD_ADVANCED failures.
  const directory = await mkdtemp(path.join(tmpdir(), 'arc-owner-'));
  const dataFile = path.join(directory, 'native.json');
  const desktopThread = randomUUID(), desktopTurn = randomUUID();
  const read = () => JSON.parse(readFileSync(dataFile, 'utf8'));
  const save = (data: any) => { writeFileSync(dataFile + '.tmp', JSON.stringify(data)); renameSync(dataFile + '.tmp', dataFile); };
  save({ [desktopThread]: { id: desktopThread, cwd: directory, turns: [{ id: desktopTurn, status: 'inProgress', items: [], input: [] }], phantom: false } });
  await mkdir(path.join(directory, 'ipc'));
  const sockets = new Set<Socket>();
  let revision = 0;
  const send = (socket: Socket, value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4); header.writeUInt32LE(bytes.length); socket.write(Buffer.concat([header, bytes])); };
  const snapshot = (socket: Socket, thread: string) => {
    const row = read()[thread], entities = Object.fromEntries(row.turns.map((turn: any) => [turn.id, { ...turn, turnId: turn.id }]));
    // A real native turn and an unconfirmed Desktop UI placeholder coexist.
    if (row.phantom) entities.placeholder = { turnId: null, status: 'inProgress', items: [] };
    const state = { id: thread, cwd: directory, threadRuntimeStatus: { type: row.turns.at(-1)?.status === 'inProgress' ? 'active' : 'idle' }, latestModel: 'fixture-model',
      turnHistory: { kind: 'canonical', history: { isComplete: true, entitiesByKey: entities, islands: [{ newerBoundary: { status: 'exhausted' }, entries: Object.keys(entities).map(value => ({ value })) }] } } };
    send(socket, { type: 'broadcast', method: 'thread-stream-state-changed', version: 11, sourceClientId: 'fixture-owner', params: { hostId: 'local', conversationId: thread, change: { type: 'snapshot', revision: ++revision, conversationState: state } } });
  };
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); let buffer = Buffer.alloc(0);
    socket.on('data', bytes => {
      buffer = Buffer.concat([buffer, bytes]);
      while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE() + 4) {
        const size = buffer.readUInt32LE(), request = JSON.parse(buffer.subarray(4, size + 4).toString()); buffer = buffer.subarray(size + 4);
        const { method, params } = request, thread = params?.conversationId;
        if (method === 'thread-stream-following-changed') { snapshot(socket, thread); continue; }
        let result: unknown = {};
        if (method === 'initialize') result = { clientId: 'fixture-follower' };
        else if (method === 'thread-owner-discovery') result = {};
        else if (method === 'thread-follower-update-thread-settings') result = { applied: true };
        else if (method === 'thread-follower-start-turn') {
          const data = read(), turn = { id: randomUUID(), status: 'inProgress', items: [], input: params.turnStart.request.input };
          data[thread].turns.push(turn); save(data); result = { result: { turn } }; snapshot(socket, thread);
        } else if (method === 'thread-follower-steer-turn') {
          const data = read();
          if (data[thread].phantom) {
            send(socket, { type: 'response', requestId: request.requestId, handledByClientId: 'fixture-owner', resultType: 'error', error: 'thread-follower-steer-turn-timeout' }); continue;
          }
          const turn = data[thread].turns.at(-1); turn.input.push(...params.input); save(data); result = { result: { turnId: turn.id } }; snapshot(socket, thread);
        }
        send(socket, { type: 'response', requestId: request.requestId, handledByClientId: 'fixture-owner', resultType: 'success', result });
      }
    });
  });
  await new Promise<void>(resolve => server.listen(path.join(directory, 'ipc/ipc.sock'), resolve));
  const fixture = await nativeControl(`
    import { createInterface } from 'node:readline'; import {readFileSync,writeFileSync,renameSync} from 'node:fs'; import {randomUUID} from 'node:crypto';
    const file=process.env.ARC_OWNER_DATA, save=data=>{writeFileSync(file+'.rpc',JSON.stringify(data));renameSync(file+'.rpc',file);};
    for await (const line of createInterface({input:process.stdin})) {
      const {id,method,params}=JSON.parse(line); if(id===undefined)continue;
      const data=JSON.parse(readFileSync(file,'utf8')); let row=data[params?.threadId],result={};
      if(method==='thread/start'){const threadId=randomUUID();row=data[threadId]={id:threadId,cwd:params.cwd,turns:[]};save(data);result={thread:row};}
      if(method==='thread/read')result={thread:{...row,status:{type:row?.turns.at(-1)?.status==='inProgress'?'active':'idle'}}};
      if(method==='thread/turns/list')result={data:[...row.turns].reverse().slice(0,params.limit),nextCursor:null};
      if(method==='turn/start'){const turn={id:randomUUID(),status:'inProgress',items:[],input:params.input};row.turns.push(turn);save(data);result={turn};}
      if(method==='turn/steer'){row.turns.at(-1).input.push(...params.input);save(data);result={turnId:row.turns.at(-1).id};}
      process.stdout.write(JSON.stringify({id,result})+'\\n');
    }
  `, { CODEX_HOME: directory, ARC_OWNER_DATA: dataFile, ARC_FIXTURE_DESKTOP: '1', ARC_DEV_INSTANCE_ID: 'ax3-fault-test' });
  const waitQueue = async (threadId: string, queueId: string, state: string) => {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const row = (await fixture.call('codex_queue', {threadId, queueId})).items[0];
      if (row.state === state) return row;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(JSON.stringify(await fixture.call('codex_queue', {threadId, queueId})));
  };
  try {
    assert.equal((await fixture.completed('codex_send', {threadId:desktopThread,prompt:'Establish self-test dispatch',sendMode:'steer'})).state, 'completed');
    const queued = await fixture.completed('codex_send', { threadId: desktopThread, prompt: 'After completion', sendMode: 'next' });
    assert.equal(queued.dispatchMode, 'queued');
    const injected = await fixture.call('acceptance_fault', {threadId:desktopThread,mode:'placeholder'});
    assert.equal(injected.injected, true, JSON.stringify(injected));
    const rejected = await fixture.call('codex_queue_control', {threadId:desktopThread, queueId:queued.queueId, action:'promote'});
    assert.equal(rejected.error.code, 'DESKTOP_STEER_UNAVAILABLE');
    assert.equal((await fixture.call('codex_queue', {queueId:queued.queueId})).items[0].state, 'queued');
    for (const sendMode of ['steer', 'auto', undefined]) {
      const result = await fixture.completed('codex_send', {threadId:desktopThread, prompt:'Steer', ...(sendMode ? {sendMode} : {})});
      assert.equal(result.error?.code ?? result.result?.error?.code, 'DESKTOP_STEER_UNAVAILABLE');
    }
    assert.equal((await fixture.call('acceptance_fault', {threadId:desktopThread,mode:'clear'})).injected, false);
    let data = read(); data[desktopThread].turns.at(-1).status = 'completed'; save(data);
    for (const socket of sockets) snapshot(socket, desktopThread);
    assert.equal((await waitQueue(desktopThread, queued.queueId, 'sent')).state, 'sent');
    data = read(); data[desktopThread].phantom = false; save(data);
    for (const socket of sockets) snapshot(socket, desktopThread);
    await fixture.api('task-settings', {autoOpenCodex:false}, 'PUT');
    const created = await fixture.completed('codex_create', {prompt:'Start', thread:{cwd:directory}});
    assert.equal(created.state, 'completed', JSON.stringify(created));
    for (const threadId of [desktopThread, created.threadId]) {
      const queue = await fixture.completed('codex_send', {threadId, prompt:'Promote once', sendMode:'queue'});
      const promoted = await fixture.call('codex_queue_control', {threadId, queueId:queue.queueId, action:'promote'});
      assert.equal(promoted.changed, 1, JSON.stringify(promoted));
      await waitQueue(threadId, queue.queueId, 'steered');
      for (const sendMode of ['steer', 'auto', undefined]) {
        const result = await fixture.completed('codex_send', {threadId, prompt:'Steer input', ...(sendMode ? {sendMode} : {})});
        assert.equal(result.state, 'completed', JSON.stringify(result)); assert.equal(result.dispatchMode, 'steered');
      }
      const next = await fixture.completed('codex_send', {threadId, prompt:'FIFO input', sendMode:'next'});
      assert.equal(next.dispatchMode, 'queued');
      const state = read(); state[threadId].turns.at(-1).status = 'completed'; save(state);
      if (threadId === desktopThread) for (const socket of sockets) snapshot(socket, threadId);
      const sent = await waitQueue(threadId, next.queueId, 'sent');
      const turns = await fixture.call('codex_call', {method:'thread/turns/list', params:{threadId,limit:1,sortDirection:'desc'}, waitMs:1000});
      assert.equal(turns.result.data[0].id, sent.turnId);
    }
  } finally { await fixture.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, {recursive:true,force:true}); }
});
