import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeControl} from './helpers/native-control.ts';
import {assertNextCalls} from './helpers/continuations.ts';

test('Direct CLI failures retain schema-valid recovery and fail the process', {skip:process.platform==='win32'},async()=>{
  // Regression: seven direct CLI failures discarded next while receipt failures preserved it.
  const fixture=await nativeControl(`import {createInterface} from 'node:readline';
for await(const line of createInterface({input:process.stdin})) {
 const {id,method}=JSON.parse(line);if(id===undefined)continue;
 process.stdout.write(JSON.stringify(['thread/read','thread/resume'].includes(method)?{id,error:{code:-32600,message:'thread already has an active writer'}}:{id,result:{}})+'\\n');
}`);
  try {
    const threadId='00000000-0000-4000-8000-000000000001';
    for(const [op,args,code] of [
      ['codex_read',{threadId},'THREAD_WRITER_BUSY'],
      ['codex_read',{threadId,statusOnly:true},'THREAD_WRITER_BUSY'],
      ['notify_control',{action:'verify',target:'session_011111111111111111111111'},'NOTIFICATION_TARGET_NOT_BOUND_TO_SOURCE'],
      ['receipt',{requestId:'missing-receipt'},'INVALID_ARGUMENTS'],
      ['codex_read',{unknown:true},'INVALID_ARGUMENTS'],
      ['unknown_operation',{},'UNKNOWN_OP'],
    ] as const) {
      await assert.rejects(fixture.shell(`echo '${JSON.stringify(args)}' | arc cli control ${op} --stdin`),(error:any)=>{
        const response=JSON.parse(error.stdout);
        assert.equal(error.code,1);assert.equal(response.ok,false);assert.equal(response.error.code,code);
        assertNextCalls(response);
        const missing=structuredClone(response);delete missing.next;
        assert.throws(()=>assertNextCalls(missing),/missing next/);
        return true;
      });
    }
    await assert.rejects(fixture.shell(`echo '${JSON.stringify({threadId})}' | arc cli wait --op codex_read --control --stdin --until '/runtimeStatus == "idle"' --timeout 1`),(error:any)=>{const response=JSON.parse(error.stdout);assertNextCalls(response);assert.equal(response.next.op,'codex_owner');return true;});
    await assert.rejects(fixture.shell('arc cli control --unknown'),(error:any)=>{assertNextCalls(JSON.parse(error.stdout));return true;});
  }finally{await fixture.close();}
});
