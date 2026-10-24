import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nativeControl} from './helpers/native-control.ts';

test('The documented scenario readiness command waits through POST model snapshots', {skip:process.platform==='win32'}, async()=>{
  // Regression: the exact documented cli wait app.snapshot command rejected its POST read as a write.
  const fixture=await nativeControl('',{ARC_FIXTURE_SNAPSHOT:'1'});
  try {
    const docs=await readFile('docs/reference/cli.md','utf8');
    const command=docs.match(/`(echo '[^`]+arc cli wait --op app\.snapshot[^`]+)`/)![1];
    const {stdout}=await fixture.shell(command);
    const result=JSON.parse(stdout);assert.equal(result.ok,true);assert.equal(result.result.lastResult.model.scenario.ready,true);
    await assert.rejects(fixture.shell(command.replace('"modelOnly":true','"modelOnly":true,"width":600')), (error:any)=>JSON.parse(error.stdout).error.message.includes("read-only op"));
  } finally {await fixture.close();}
});
