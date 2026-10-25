import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeControl } from './helpers/native-control.ts';

test('native writer conflicts retain recovery guidance through send, load and read', async () => {
  // Regression: native errors include the thread ID between thread and already, including nested load failures.
  const fixture = await nativeControl(`
    import { createInterface } from 'node:readline';
    for await (const line of createInterface({input:process.stdin})) {
      const {id,method,params}=JSON.parse(line); if(id===undefined)continue;
      const error = {code:-32600,message:'thread '+params?.threadId+' already has an active writer'};
      const reply = ['thread/read','thread/resume'].includes(method) ? {id,error} : {id,result:{}};
      process.stdout.write(JSON.stringify(reply)+'\\n');
    }
  `);
  try {
    const threadId = '00000000-0000-4000-8000-000000000001';
    for (const result of [
      await fixture.completed('codex_send', { threadId, prompt: 'Follow up', sendMode: 'next', resume: {} }),
      await fixture.call('codex_call', { method: 'thread/resume', params: { threadId }, waitMs: 1000 }),
      await fixture.call('codex_read', { threadId, statusOnly: true }),
    ]) {
      let value = result;
      if (value.requestId && !value.error && !value.result?.error) value = await fixture.call('receipt', {requestId:value.requestId});
      const error = value.error ?? value.result?.error;
      assert.equal(error?.code, 'THREAD_WRITER_BUSY', JSON.stringify(value));
      assert.equal(error.retryable, false);
      assert.equal(value.next.op, 'codex_owner');
      assert.ok(value.next.hint);
      assert.equal(error.ownership.state,"held");
      assert.equal(error.ownership.evidence,"native-writer-rejection");
    }
  } finally { await fixture.close(); }
});


test('Held external writers are diagnosed before Desktop read discovery', {skip:process.platform==='win32'}, async()=>{
  // Regression: real external writer reads failed with a generic Desktop discovery timeout.
  const directory=await mkdtemp(path.join(tmpdir(),'arc-external-writer-'));
  const threadId='00000000-0000-4000-8000-000000000002';
  await mkdir(path.join(directory,'thread-writer-locks'));
  const writer=spawn('python3',['-c','import fcntl,sys; f=open(sys.argv[1],"w"); fcntl.flock(f,fcntl.LOCK_EX); print("ready",flush=True); sys.stdin.read()',path.join(directory,'thread-writer-locks',threadId+'.lock')]);
  await new Promise<void>(resolve=>writer.stdout.once('data',()=>resolve()));
  const fixture=await nativeControl('',{CODEX_HOME:directory,ARC_FIXTURE_DESKTOP:'1'});
  try {
    for(const statusOnly of [false,true]) {
      const result=await fixture.call('codex_read',{threadId,statusOnly});
      assert.equal(result.error.code,'THREAD_WRITER_BUSY',JSON.stringify(result));
      assert.equal(result.error.ownership.owner,'external');assert.equal(result.error.ownership.state,'held');
      if(process.platform==='darwin')assert.ok(result.error.ownership.processes.some((p:any)=>p.pid===writer.pid));
    }
  } finally {await fixture.close();writer.stdin.end();await new Promise(resolve=>writer.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
});


test('Releasing an already unheld writer is a no-op before archive',async()=>{
  // Regression: codex_archive release:true refused a confirmed unheld non-connector thread.
  const fixture=await nativeControl(`import{createInterface}from'node:readline';for await(const line of createInterface({input:process.stdin})){const{id,method,params}=JSON.parse(line);if(id===undefined)continue;const result=method==='thread/read'?{thread:{id:params.threadId,status:{type:'idle'}}}:{};process.stdout.write(JSON.stringify({id,result})+'\\n');}`);
  try {
    const threadId='00000000-0000-4000-8000-000000000003';
    const release=await fixture.completed('codex_release',{threadId});assert.equal(release.result.alreadyUnheld,true);assert.equal(release.result.released,true);
    const archive=await fixture.completed('codex_archive',{threadId,release:true});assert.equal(archive.state,'completed',JSON.stringify(archive));assert.equal(archive.result.archived,true);
  }finally{await fixture.close();}
});


test('Archive release is a no-op for an idle connector retaining its native writer',{skip:process.platform==='win32'},async()=>{
  // Regression: release:true returned RELEASE_UNCONFIRMED after unsubscribe while plain native archive could finish on the same idle connector.
  const directory=await mkdtemp(path.join(tmpdir(),'arc-idle-archive-'));
  const threadId='00000000-0000-4000-8000-000000000007';
  const turnId='00000000-0000-4000-8000-000000000008';
  const fixture=await nativeControl(`import{createInterface}from'node:readline';
for await(const line of createInterface({input:process.stdin})){
 const{id,method,params}=JSON.parse(line);if(id===undefined)continue;
 const turn={id:'${turnId}',status:'completed',items:[]};let result={};
 if(method==='thread/start'||method==='thread/read')result={thread:{id:'${threadId}',cwd:params.cwd||'/tmp',status:{type:'idle'}}};
 if(method==='turn/start')result={turn};
 if(method==='thread/turns/list')result={data:[turn],nextCursor:null};
 process.stdout.write(JSON.stringify({id,result})+'\\n');
}`,{CODEX_HOME:directory});
  let writer:ReturnType<typeof spawn>|undefined;
  try {
    await fixture.api('task-settings',{autoOpenCodex:false},'PUT');
    assert.equal((await fixture.completed('codex_create',{prompt:'Idle archive fixture',thread:{cwd:'/tmp'}})).state,'completed');
    await mkdir(path.join(directory,'thread-writer-locks'));
    writer=spawn('python3',['-c','import fcntl,sys; f=open(sys.argv[1],"w"); fcntl.flock(f,fcntl.LOCK_EX); print("ready",flush=True); sys.stdin.read()',path.join(directory,'thread-writer-locks',threadId+'.lock')]);
    await new Promise<void>(resolve=>writer!.stdout!.once('data',()=>resolve()));
    assert.equal((await fixture.call('codex_owner',{threadId})).owner,'connector');
    const archived=await fixture.completed('codex_archive',{threadId,release:true});
    assert.equal(archived.state,'completed',JSON.stringify(archived));assert.equal(archived.result.archived,true);
    assert.equal(writer.exitCode,null);
    assert.equal((await fixture.call('guide',{op:'codex_archive'})).retry.mode,'receipt');
  }finally{
    await fixture.close();
    if(writer){writer.stdin!.end();await new Promise(resolve=>writer!.once('exit',resolve));}
    await rm(directory,{recursive:true,force:true});
  }
});
