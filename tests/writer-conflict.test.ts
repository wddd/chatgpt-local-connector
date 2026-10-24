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
      assert.equal(error.next.op, 'codex_read');
      assert.ok(error.next.hint);
      assert.match(error.nativeError, /already has an active writer/);
    }
  } finally { await fixture.close(); }
});
