import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeControl } from './helpers/native-control.ts';
test('archived task filters are discoverable and listing never needs live enrichment by default', async () => {
  // Regression: archived task listing spent the live enrichment budget and omitted its filters from the shorthand.
  const f=await nativeControl(`import{createInterface}from'node:readline';for await(const l of createInterface({input:process.stdin})){const{id,method,params}=JSON.parse(l);if(id===undefined)continue;process.stdout.write(JSON.stringify(method==='thread/list'?{id,result:{data:[{id:'example',name:params.searchTerm,archived:params.archived}],nextCursor:null}}:method==='initialize'?{id,result:{}}:{id,error:{code:-1,message:'Live read must not be needed'}})+'\\n');}`);
  try {
    const page=await f.call('codex_tasks',{archived:true,searchTerm:'needle'});
    assert.equal(page.enriched,false);assert.equal(page.tasks[0].title,'needle');assert.equal(page.tasks[0].status,'archived');assert.equal(page.tasks[0].runtimeStatus,null);
    const guide=await f.call('guide',{view:'full'});const signature=guide.ops.find((o:any)=>o.op==='codex_tasks').signature;
    assert.match(signature,/archived/);assert.match(signature,/searchTerm/);assert.match(signature,/enrich/);
  }finally{await f.close();}
});
