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


test('Decision policy folds sparse dispatches without losing full history or selection constraints',async()=>{
  // Regression: mandatory dispatch policy reads exceeded the model context budget with verbose history and repeated model settings.
  const directory=await mkdtemp(path.join(tmpdir(),'arc-policy-decision-'));
  const state=path.join(directory,'state');
  const criteria='Selection guidance. '.repeat(145);
  const threadId='00000000-0000-4000-8000-000000000001';
  const records=path.join(state,'dispatches',threadId);
  const rows:any[]=[];
  const add=(model:string,n:number,duration:number)=>{
    for(let i=0;i<n;i++) rows.push({threadId,turnId:String(rows.length),model,effort:'high',serviceTier:'default',dispatchMode:'new-turn',submittedAt:new Date().toISOString(),review:{verdict:'pass'},terminal:{state:'completed',observedDurationMs:duration}});
  };
  add('model-main',10,600000);add('model-small',9,60000);add('model-tiny',2,180000);
  for(let i=0;i<12;i++) rows.push({threadId,turnId:String(rows.length),model:'model-small',effort:'high',serviceTier:'default',dispatchOrigin:'external',review:{verdict:'rework',reviewedAt:new Date().toISOString()}});
  for(let i=0;i<12;i++) add(`model-rare-${i}`,1,60000);
  const fixture=await nativeControl(`import {createInterface} from 'node:readline';
for await(const line of createInterface({input:process.stdin})) {
  const {id,method}=JSON.parse(line);
  const result=method==='model/list'?{data:['model-main','model-small','model-tiny','model-four','model-five','model-six','model-seven'].map(model=>({model,supportedReasoningEfforts:['low','medium','high','xhigh','max','ultra'].map(reasoningEffort=>({reasoningEffort})),serviceTiers:[{id:'priority',name:'Fast'}]}))}:{data:[]};
  if(id!==undefined) console.log(JSON.stringify({id,result}));
}`,{ARC_STATE_DIR:state});
  try {
    assert.equal((await fixture.completed('write',{path:path.join(state,'dispatch-policy.json'),content:JSON.stringify({codex:{criteria,model:'model-main',effort:'high',denyModels:['model-denied'],serviceTiers:{'model-main':'default'}}})})).state,'completed');
    for(const [i,row] of rows.entries()) assert.equal((await fixture.completed('write',{path:path.join(records,`${i}.json`),content:JSON.stringify(row)})).state,'completed');
    const args={agent:'codex',all:true};
    const decision=await fixture.call('dispatch_policy',args);
    const agent=decision.agents[0];
    assert.equal(agent.defaults.model,'model-main');assert.equal(agent.defaults.effort,'high');
    assert.deepEqual(agent.denyModels,['model-denied']);
    assert.equal(agent.criteria,criteria);
    const history=agent.history.groups as string[];
    assert.equal(history.length,2);
    assert.ok(history.some(row=>/model-main.*n10.*med10\.0m.*pass10/.test(row)));
    assert.ok(history.some(row=>/other.*n23.*med1\.0m.*pass23.*ext12.*rework12/.test(row)));
    assert.ok(!history.some(row=>row.startsWith('model-small')));
    for(const model of ['model-main','model-small','model-tiny','model-four','model-five','model-six','model-seven']) assert.ok(agent.models.some((row:string)=>row.includes(model)));
    const cached=await fixture.call('dispatch_policy',{...args,knownCriteriaHash:agent.criteriaHash});
    assert.equal(cached.agents[0].criteriaUnchanged,true);
    assert.equal(cached.arcInbox,undefined);assert.equal(decision.arcInbox,undefined);
    assert.ok(JSON.stringify(cached).length<=2000,JSON.stringify(cached));
    assert.ok(JSON.stringify(decision).length<=4500,JSON.stringify(decision));
    const full=await fixture.call('dispatch_policy',{...args,view:'full'});
    const detail=full.agents[0];
    assert.equal(detail.policy.criteria,criteria);
    assert.equal(detail.history.groups.length,15);
    const small=detail.history.groups.find((g:any)=>g.model==='model-small');
    assert.equal(small.dispatches,9);assert.equal(small.external.reviews,12);
    assert.equal(small.medianObservedDurationMs,60000);
  } finally {await fixture.close();await rm(directory,{recursive:true,force:true});}
});
