import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {nativeControl} from './helpers/native-control.ts';

test('Dispatch criteria hashes round-trip as strings or per-agent maps in both views',async()=>{
  // Regression: passing the criteriaHash string returned by dispatch_policy failed with INVALID_ARGUMENTS.
  const directory=await mkdtemp(path.join(tmpdir(),'arc-policy-hash-'));
  const state=path.join(directory,'state');
  const policy=path.join(state,'dispatch-policy.json');
  const fixture=await nativeControl(`import {createInterface} from 'node:readline';
for await(const line of createInterface({input:process.stdin})) {
  const {id}=JSON.parse(line);if(id!==undefined)console.log(JSON.stringify({id,result:{data:[]}}));
}`,{ARC_STATE_DIR:state});
  try {
    const written=await fixture.completed('write',{path:policy,content:JSON.stringify({criteria:'Fixture global criteria',codex:{criteria:'Fixture Codex criteria'}})});
    assert.equal(written.state,'completed',JSON.stringify(written));
    for(const view of ['decision','full']) {
      const args={agent:'codex',view,all:true};
      const row=(result:any)=>view==='full'?result.agents[0].policy:result.agents[0];
      const initial=await fixture.call('dispatch_policy',args);
      assert.equal(initial.criteria,'Fixture global criteria',JSON.stringify(initial));
      assert.equal(row(initial).criteria,'Fixture Codex criteria');
      const global=await fixture.call('dispatch_policy',{...args,knownCriteriaHash:initial.criteriaHash});
      assert.equal(global.criteriaUnchanged,true);assert.equal(global.criteria,undefined);
      assert.equal(row(global).criteria,'Fixture Codex criteria');
      const agent=await fixture.call('dispatch_policy',{...args,knownCriteriaHash:row(initial).criteriaHash});
      assert.equal(row(agent).criteriaUnchanged,true);assert.equal(row(agent).criteria,undefined);
      assert.equal(agent.criteria,'Fixture global criteria');
      const mapped=await fixture.call('dispatch_policy',{...args,knownCriteriaHash:{global:initial.criteriaHash,codex:row(initial).criteriaHash}});
      assert.equal(mapped.criteriaUnchanged,true);assert.equal(row(mapped).criteriaUnchanged,true);
      const changed=await fixture.call('dispatch_policy',{...args,knownCriteriaHash:'outdated-hash'});
      assert.equal(changed.criteria,initial.criteria);assert.equal(row(changed).criteria,row(initial).criteria);
    }
  }finally{await fixture.close();await rm(directory,{recursive:true,force:true});}
});
