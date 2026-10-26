import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nativeControl } from './helpers/native-control.ts';

const server = `import {createInterface} from 'node:readline'; import {randomUUID} from 'node:crypto';
const threads=new Map();
for await (const line of createInterface({input:process.stdin})) {
 const {id,method,params}=JSON.parse(line); if(id===undefined)continue;
 let result={};
 if(method==='account/read')result={account:{type:'chatgpt',email:'person@example.com',planType:'plus'}};
 if(method==='account/rateLimits/read')result={rateLimits:{}};
 if(method==='model/list')result={data:[]};
 if(method==='thread/start'){const t={id:randomUUID(),cwd:params.cwd,turns:[]};threads.set(t.id,t);result={thread:t};}
 if(method==='thread/read')result={thread:{...threads.get(params.threadId),status:{type:'idle'}}};
 if(method==='thread/resume')result={thread:threads.get(params.threadId)};
 if(method==='thread/turns/list')result={data:[...threads.get(params.threadId).turns].reverse(),nextCursor:null};
 if(method==='turn/start'){const turn={id:randomUUID(),status:'completed',items:[]};threads.get(params.threadId).turns.push(turn);result={turn};}
 console.log(JSON.stringify({id,result}));
}`;

test('Source conversation ops isolate accounts and persist bindings through restart', {skip:process.platform !== 'darwin'}, async () => {
  // Contract: src ops preserve source-account scope, task refs and manual binding through the frozen query/act surface.
  const fixture = await nativeControl(server, {ARC_FIXTURE_SNAPSHOT:'src-conversations'});
  try {
    const owners: Array<{ingressId:string; accountId:string}> = [];
    for (const id of ['src-owner-a','src-owner-b']) {
      const ingress = await fixture.api('ingress', {id,name:id,controlSource:'claude',transport:'https',auth:'bearer',bearerToken:'synthetic-fixture'.padEnd(40,'x'),toolPolicy:'all',config:{httpsProvider:'custom',httpsUrl:'https://fixture.example.com/mcp'}});
      await fixture.api(`ingress/${ingress.id}/start`, {});
      const self = await fixture.sourceCall(ingress.id,'whoami',{},'query');
      assert.ok(self.id);
      owners.push({ingressId:ingress.id,accountId:self.id});
    }
    const [a,b]=owners;
    const chat=randomUUID(), second=randomUUID();
    const chatUrl=`https://claude.ai/chat/${chat}`, secondUrl=`https://claude.ai/chat/${second}`;
    for (const op of ['src_conversations','src_chrome_profiles','src_conversation_open','src_login_import','src_login_clear','src_conversation_bind']) {
      const guide=await fixture.call('guide',{op});
      assert.equal(guide.op,op);
      assert.equal(guide.retry.mode,op==='src_conversations'||op==='src_chrome_profiles'?'read-only':'read-back');
    }
    const opened=await fixture.sourceCall(a.ingressId,'src_conversation_open',{accountId:a.accountId,url:chatUrl});
    assert.equal(opened.accountId,a.accountId);
    const denied=await fixture.sourceCall(a.ingressId,'src_conversation_open',{accountId:b.accountId});
    assert.equal(denied.error.code,'SRC_ACCOUNT_SCOPE');
    const invalid=await fixture.sourceCall(a.ingressId,'src_conversation_open',{accountId:a.accountId,url:'https://example.com/chat/'+chat});
    assert.equal(invalid.error.code,'SRC_URL_INVALID');
    await fixture.api('task-settings',{autoOpenCodex:false,enabled:false},'PUT');
    const requestId=randomUUID();
    const receipt=await fixture.sourceCall(a.ingressId,'codex_create',{prompt:'Synthetic task',notify:null,requestId,waitMs:10000});
    assert.equal(receipt.state,'completed',JSON.stringify(receipt));
    const task=receipt.threadId;
    assert.ok(task);
    const read=await fixture.sourceCall(a.ingressId,'codex_read',{threadId:task},'query');
    assert.equal(read.srcConversation.id,chat);
    assert.equal(read.srcConversation.basis,'correlated');
    let registry=await fixture.sourceCall(a.ingressId,'src_conversations',{},'query');
    assert.ok(owners.every(owner=>registry.accounts.some((row:any)=>row.accountId===owner.accountId)));
    const untouched=registry.accounts.find((row:any)=>row.accountId===b.accountId);
    assert.equal(untouched.status,'not-imported');
    assert.equal(untouched.storeId,null);
    const selected=registry.accounts.find((row:any)=>row.accountId===a.accountId);
    let store=selected.storeId;
    assert.ok(store);
    assert.equal(selected.conversations[0].taskRefs[0].id,task);
    await fixture.sourceCall(a.ingressId,'src_conversation_open',{accountId:a.accountId,url:secondUrl});
    // The authenticated Desktop channel publishes URL metadata; no native window is involved.
    await fixture.api('src-conversations/observe',{containers:[{accountId:a.accountId,storeId:store,status:'signed-in',active:true,url:secondUrl}]});
    const rebound=await fixture.sourceCall(a.ingressId,'src_conversation_bind',{accountId:a.accountId,agent:'codex',taskId:task,conversationId:second});
    assert.equal(rebound.conversation.id,second);
    assert.equal(rebound.conversation.basis,'manual');
    const peer=await fixture.sourceCall(b.ingressId,'src_conversation_bind',{accountId:b.accountId,agent:'codex',taskId:task,conversationId:null});
    assert.equal(peer.error.code,'SRC_TASK_SCOPE');
    // Receipt replay cannot recapture a different page or overwrite a manual correction.
    await fixture.sourceCall(a.ingressId,'codex_create',{prompt:'Synthetic task',notify:null,requestId,waitMs:10000});
    assert.equal((await fixture.sourceCall(a.ingressId,'codex_read',{threadId:task},'query')).srcConversation.id,second);
    await fixture.sourceCall(b.ingressId,'src_conversation_open',{accountId:b.accountId,url:chatUrl});
    await fixture.sourceCall(a.ingressId,'src_conversation_open',{accountId:a.accountId});
    const sent=await fixture.sourceCall(a.ingressId,'codex_send',{threadId:task,prompt:'Synthetic follow-up',notify:null,waitMs:10000});
    assert.equal(sent.state,'completed',JSON.stringify(sent));
    assert.equal((await fixture.sourceCall(a.ingressId,'codex_read',{threadId:task},'query')).srcConversation,null);
    await fixture.sourceCall(a.ingressId,'src_conversation_bind',{accountId:a.accountId,agent:'codex',taskId:task,conversationId:second});
    await fixture.restart();
    registry=await fixture.call('src_conversations',{accountId:a.accountId});
    assert.equal(registry.accounts[0].storeId,store);
    assert.equal(registry.accounts[0].open,false);
    assert.equal(registry.accounts[0].currentConversation,null);
    assert.equal(registry.accounts[0].conversations.find((r:any)=>r.id===second).taskRefs[0].basis,'manual');
    const cleared=await fixture.call('src_login_clear',{accountId:a.accountId});
    assert.equal(cleared.status,'not-imported');
    const kept=(await fixture.call('src_conversations',{accountId:a.accountId})).accounts[0];
    assert.equal(kept.storeId,null);
    assert.equal(kept.open,false);
    assert.equal(kept.conversations.find((r:any)=>r.id===second).taskRefs[0].basis,'manual');
    await fixture.sourceCall(a.ingressId,'src_conversation_open',{accountId:a.accountId});
    const reopened=(await fixture.call('src_conversations',{accountId:a.accountId})).accounts[0];
    assert.notEqual(reopened.storeId,store);
    store=reopened.storeId;
    const unbound=await fixture.call('src_conversation_bind',{accountId:a.accountId,agent:'codex',taskId:task,conversationId:null});
    assert.equal(unbound.conversation,null);
    const after=await fixture.call('src_conversations',{accountId:a.accountId});
    assert.ok(after.accounts[0].conversations.every((r:any)=>r.taskRefs.length===0));
    const importing=await fixture.sourceCall(a.ingressId,'src_login_import',{accountId:a.accountId,profile:'Default'});
    assert.equal(importing.status,'importing');
    assert.equal(importing.next.op,'src_conversations');
    assert.deepEqual(importing.next.args,{accountId:a.accountId});
    assert.equal((await fixture.sourceCall(a.ingressId,'src_login_import',{accountId:a.accountId,profile:'Default'})).status,'importing');
    const progress=await fixture.sourceCall(a.ingressId,'src_conversations',{accountId:a.accountId},'query');
    assert.equal(progress.accounts[0].status,'importing');
    await fixture.api('src-conversations/observe',{containers:[{accountId:a.accountId,storeId:store,status:'import-blocked',reason:'keychain-timeout',open:false}]});
    const blocked=await fixture.sourceCall(a.ingressId,'src_conversations',{accountId:a.accountId},'query');
    assert.equal(blocked.accounts[0].status,'import-blocked');
    assert.equal(blocked.accounts[0].reason,'keychain-timeout');
    assert.ok(blocked.accounts[0].hint.includes('macOS login password'));
    assert.ok(blocked.accounts[0].hint.includes('Always Allow'));
    assert.equal(blocked.accounts[0].open,false);
    await fixture.api('src-conversations/observe',{containers:[{accountId:a.accountId,storeId:store,status:'import-mismatch',detectedAccountId:b.accountId,open:false}]});
    const mismatch=(await fixture.call('src_conversations',{accountId:a.accountId})).accounts[0];
    assert.equal(mismatch.status,'import-mismatch');
    assert.equal(mismatch.detectedAccountId,b.accountId);
    await fixture.api('src-conversations/observe',{containers:[{accountId:a.accountId,storeId:store,status:'import-unverified',open:false}]});
    const unverified=(await fixture.call('src_conversations',{accountId:a.accountId})).accounts[0];
    assert.equal(unverified.status,'import-unverified');
    assert.equal(unverified.detectedAccountId,null);
  } finally {await fixture.close();}
});


test('Source inventory includes other Claude accounts before a website container exists', {skip:process.platform !== 'darwin'}, async () => {
  // Regression: src_conversations reused mutation ownership filtering and hid another known Claude SRC account.
  const fixture=await nativeControl(server,{ARC_FIXTURE_SNAPSHOT:'src-conversations'});
  try {
    const owners:Array<{source:string;account:string}>=[];
    for (const id of ['inventory-one','inventory-two']) {
      await fixture.api('ingress',{id,name:id,controlSource:'claude',transport:'https',auth:'bearer',bearerToken:'synthetic-inventory'.padEnd(40,'x'),toolPolicy:'all',config:{httpsProvider:'custom',httpsUrl:'https://fixture.example.com/mcp'}});
      await fixture.api(`ingress/${id}/start`,{});
      const who=await fixture.sourceCall(id,'whoami',{},'query');
      owners.push({source:id,account:who.id});
    }
    const listed=await fixture.sourceCall(owners[0].source,'src_conversations',{},'query');
    for (const owner of owners) {
      const row=listed.accounts.find((a:any)=>a.accountId===owner.account);
      assert.ok(row);
      assert.equal(row.status,'not-imported');
      assert.equal(row.storeId,null);
    }
    const peer=await fixture.sourceCall(owners[0].source,'src_conversations',{accountId:owners[1].account},'query');
    assert.equal(peer.accounts[0].accountId,owners[1].account);
    const denied=await fixture.sourceCall(owners[0].source,'src_login_clear',{accountId:owners[1].account});
    assert.equal(denied.error.code,'SRC_ACCOUNT_SCOPE');
  } finally {await fixture.close();}
});
