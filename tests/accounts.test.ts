import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nativeControl } from './helpers/native-control.ts';

const server = `import {createInterface} from 'node:readline';
for await (const line of createInterface({input:process.stdin})) {
 const {id,method,params}=JSON.parse(line); if(id===undefined) continue;
 let result={};
 if(method==='account/read') result={account:{type:'chatgpt',email:'person@example.com',planType:'plus'}};
 if(method==='account/rateLimits/read') result={rateLimits:{primary:{usedPercent:25,windowDurationMins:300,resetsAt:2000000000}}};
 if(method==='model/list') result={data:[]};
 if(method==='account/login/start') result={type:'chatgpt',loginId:'fixture-login',authUrl:'https://auth.openai.com/authorize'};
 console.log(JSON.stringify({id,result}));
}`;

test('Account operations retain identity, defaults and removal tombstones', async () => {
  // Contract: accounts list omits identity contact fields, detail retains them, and removal keeps history identity.
  const fixture = await nativeControl(server);
  try {
    const list = await fixture.call('accounts');
    const account = list.accounts.find((a: any) => a.agentProfiles.some((p: any) => p.agent === 'codex'));
    assert.ok(account.id);
    assert.equal(account.email, undefined);
    assert.equal(account.orgName, undefined);
    assert.equal(account.agentProfiles[0].kind, 'codex-home');
    assert.equal(account.agentProfiles[0].state, 'signed-in');
    const detail = await fixture.call('accounts', { id: account.id });
    assert.equal(detail.email, 'person@example.com');
    assert.equal(detail.quota.windows[0].usedPercent, 25);
    const renamed = await fixture.call('account_update', { id: account.id, alias: 'Example account', defaultFor: 'codex' });
    assert.equal(renamed.alias, 'Example account');
    assert.equal(renamed.agentProfiles.filter((p: any) => p.default).length, 1);
    assert.equal((await fixture.api(`accounts/${account.id}`)).alias, 'Example account');
    const cleared = await fixture.call('account_update', { id: account.id, defaultFor: 'codex', default: false });
    assert.ok(cleared.agentProfiles.every((p: any) => !p.default));
    await fixture.restart();
    const refreshed = await fixture.call('accounts', { id: account.id });
    assert.ok(refreshed.agentProfiles.every((p: any) => !p.default));
    const noDefault = await fixture.call('codex_create', { prompt: 'Example task', notify: null });
    assert.equal(noDefault.error.code, 'ACCOUNT_DEFAULT_MISSING');
    const missingAgent = await fixture.call('account_update', { id: account.id, default: false });
    assert.equal(missingAgent.error.code, 'ACCOUNT_DEFAULT_AGENT_REQUIRED');
    await fixture.api('accounts/update', { id: account.id, defaultFor: 'codex', default: true });
    assert.ok((await fixture.call('accounts', { id: account.id })).agentProfiles.some((p: any) => p.default));
    const self = await fixture.call('whoami');
    assert.equal(self.id, null);
    assert.equal(self.authority, 'local');
    assert.equal(self.identityResolution.state, 'not-applicable');
    assert.ok(self.sourceId);
    assert.ok(!(await fixture.api('source')).sources.some((source: any) => source.id === self.sourceId));
    assert.ok(!(await fixture.call('accounts')).accounts.some((row: any) => row.sources.includes(self.sourceId)));
    await assert.rejects(fixture.shell(`arc cli source disconnect ${self.sourceId}`), (error: any) => {
      const result = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(result.error.code, 'LOCAL_SOURCE_PROTECTED');
      assert.equal(result.next.op, null);
      assert.ok(result.next.hint);
      return true;
    });
    assert.equal((await fixture.call('whoami')).sourceId, self.sourceId);
    await fixture.api('task-settings', { enabled: true }, 'PUT');
    const requestId = randomUUID();
    const dispatchArgs = { account: 'Example account', prompt: 'Example task', notify: null, requestId };
    const receipt = await fixture.call('codex_create', dispatchArgs);
    assert.equal(receipt.state, 'awaiting-approval');
    assert.equal(receipt.agentAccountId, account.id);
    assert.equal(receipt.origin.accountId, undefined);
    assert.equal(receipt.origin.sourceId, self.sourceId);
    const removed = await fixture.call('account_remove', { id: account.id, running: 'finish' });
    assert.ok(removed.removedAt);
    assert.equal(removed.health.state, 'removed');
    assert.equal((await fixture.call('accounts')).accounts.some((a: any) => a.id === account.id), false);
    assert.equal((await fixture.call('accounts', { id: account.id })).email, 'person@example.com');
    const replay = await fixture.call('codex_create', dispatchArgs);
    assert.equal(replay.agentAccountId, account.id);
    assert.equal(replay.agentAccountRemoved, true);
    const rejected = await fixture.call('codex_create', { ...dispatchArgs, requestId: randomUUID(), account: account.id });
    assert.ok(rejected.error);
    await fixture.restart();
    assert.equal((await fixture.call('accounts', { id: account.id })).health.state, 'removed');
    assert.equal((await fixture.call('accounts')).accounts.some((a: any) => a.id === account.id), false);
  } finally { await fixture.close(); }
});
