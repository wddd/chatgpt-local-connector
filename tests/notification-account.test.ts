import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {nativeControl} from './helpers/native-control.ts';

test('Malformed cloud targets fail before binding or delivery',async()=>{
  // Regression: malformed tagged IDs reached Claude and required delivery logs to diagnose.
  const fixture=await nativeControl('');
  try {
    for(const target of [
      'session_test', 'session_01111111111111111111111', 'session_0111111111111111111111111',
      'session_01aaaaaaaaaaaaaaaaaaaaa_', 'cse_invalid', '00000000-0000-4000-8000-000000000001',
      'https://claude.ai/code/session_invalid', 'https://claude.ai/code/011111111111111111111111',
      'https://other.invalid/code/session_011111111111111111111111',
    ]) {
      for(const action of ['bind','verify']) {
        const result=await fixture.call('notify_control',{action,target});
        assert.equal(result.error.code,'INVALID_CLAUDE_SESSION',JSON.stringify(result));
        assert.equal(result.error.argument,'target');
        assert.equal(result.bound,undefined);assert.equal(result.verificationAttempts,undefined);
        assert.deepEqual(result.next.args,{topic:'notify'});
      }
    }
    assert.deepEqual((await fixture.call('notify_status')).targets,[]);
  }finally{await fixture.close();}
});

test('Cloud bind preserves a missing-session diagnosis and only safe local CLI identity', {skip:process.platform==='win32'},async()=>{
  // Regression: CLI Session not found hid the host account and returned only generic transport recovery.
  const directory=await mkdtemp(path.join(tmpdir(),'arc-notify-cli-'));
  const binary=path.join(directory,'claude');
  await writeFile(binary,`#!${process.execPath}
const args=process.argv.slice(2);
if(args[0]==='auth' && args[1]==='status') {
  console.log(JSON.stringify({loggedIn:true,email:'fixture@example.invalid',authMethod:'claude.ai',accessToken:'fixture-secret',credentials:{refreshToken:'fixture-secret'}}));
} else if(args[0]==='-p') {console.error('Session not found');process.exitCode=1;}
else {throw new Error('Unexpected CLI operation; login and logout are forbidden');}
`);
  await chmod(binary,0o755);
  const fixture=await nativeControl('',{PATH:directory+path.delimiter+process.env.PATH});
  try {
    const target='session_010000000000000000000011';
    const result=await fixture.call('notify_control',{action:'bind',target});
    assert.equal(result.ok,false);assert.equal(result.bound,true);
    assert.equal(result.error.code,'CLAUDE_SESSION_NOT_FOUND',JSON.stringify(result));
    assert.equal(result.verification.reason,'claude-session-not-found');
    assert.equal(result.error.localAccount.email,'fixture@example.invalid');
    assert.deepEqual(result.next.before.hostCommand,[binary,'auth','login']);
    assert.deepEqual(result.next.args,{action:'verify',target});
    const status=await fixture.call('notify_status',{target});
    assert.equal(status.targets[0].lastVerificationError.code,'CLAUDE_SESSION_NOT_FOUND');
    assert.equal(status.targets[0].lastVerificationError.localAccount.loggedIn,true);
    assert.ok(!JSON.stringify([result,status]).includes('fixture-secret'));
  }finally{await fixture.close();await rm(directory,{recursive:true,force:true});}
});
