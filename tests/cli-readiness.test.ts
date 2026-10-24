import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nativeControl} from './helpers/native-control.ts';

for(const surface of ['native','scenario']) test(`The documented ${surface} readiness command waits through POST model snapshots`, {skip:process.platform==='win32'}, async()=>{
  // Regression: the documented scenario wait timed out on ordinary native pages where scenario is null.
  const fixture=await nativeControl('',{ARC_FIXTURE_SNAPSHOT:surface});
  try {
    const docs=await readFile('docs/reference/cli.md','utf8');
    const pointer=surface==='native'?'/model/layoutSettled':'/model/scenario/ready';
    const command=[...docs.matchAll(/`(echo '[^`]+arc cli wait --op app\.snapshot[^`]+)`/g)].map(match=>match[1]).find(command=>command.includes(pointer))!;
    assert.ok(command,`Missing documented command for ${surface}`);
    const {stdout}=await fixture.shell(command);
    const result=JSON.parse(stdout);assert.equal(result.ok,true);const model=result.result.lastResult.model;
    if(surface==='native') {assert.equal(model.scenario,null);assert.equal(model.layoutSettled,true);} else assert.equal(model.scenario.ready,true);
    await assert.rejects(fixture.shell(command.replace('"modelOnly":true','"modelOnly":true,"width":600')), (error:any)=>JSON.parse(error.stdout).error.message.includes("read-only op"));
  } finally {await fixture.close();}
});
