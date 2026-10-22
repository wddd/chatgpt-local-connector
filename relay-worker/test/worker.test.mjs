import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const origin = 'https://relay.example';
const sha = data => createHash('sha256').update(data).digest('hex');
const identity = () => {
  const key = generateKeyPairSync('ed25519');
  const raw = key.publicKey.export({ format:'der', type:'spki' }).subarray(-32);
  return { ...key, publicKey: raw.toString('base64'), id: sha(raw) };
};
const admin = identity(), member = identity(), other = identity();
let mf, token, ws;
before(async () => {
  const bundled = await build({ entryPoints:['src/worker.ts'], bundle:true, write:false, format:'esm', external:['cloudflare:workers'] });
  mf = new Miniflare({ modules:true, script:bundled.outputFiles[0].text, compatibilityDate:'2026-07-01', compatibilityFlags:['enable_request_signal','request_signal_passthrough'],
    bindings:{ MANAGEMENT_PUBLIC_KEY:admin.publicKey, ARC_VERSION:'test' },
    durableObjects:{ REGISTRY:{ className:'Registry', useSQLite:true }, INSTANCES:{ className:'Instance', useSQLite:true } },
  });
});
after(async () => { ws?.close(); await mf?.dispose(); });
async function auth(key, payload) {
  const { challenge } = await mf.dispatchFetch(`${origin}/challenge`,{ method:'POST' }).then(r=>r.json());
  const serialized = JSON.stringify(payload);
  return { publicKey:key.publicKey, challenge, payload:serialized, signature:sign(null,Buffer.from(`arc-relay-v1\n${origin}\n${challenge}\n${sha(serialized)}`),key.privateKey).toString('base64') };
}
const call = async (key, payload) => mf.dispatchFetch(`${origin}/control`,{ method:'POST', body:JSON.stringify(await auth(key,payload)) });
const register = (key, token) => call(key,{ op:'register', publicKey:key.publicKey, name:'Test instance', token });
function messages(socket) {
  const buffered = [], waiting = [];
  socket.addEventListener('message',event=> { const next = waiting.shift(); next ? next(event.data) : buffered.push(event.data); });
  return async () => {
    const text = buffered.length ? buffered.shift() : await new Promise((resolve,reject)=> {
      const timeout = setTimeout(()=>reject(Error('WebSocket message timeout')),5000);
      waiting.push(value=>{clearTimeout(timeout);resolve(value);});
    });
    return text==='pong' ? text : JSON.parse(text);
  };
}
let next;
test('identity, replay protection, owner/member permissions and offline addresses', async () => {
  assert.equal((await mf.dispatchFetch(`${origin}/u/${member.id}/mcp`)).status,404);
  token = (await (await call(admin,{op:'rotate'})).json()).token;
  assert.equal((await register(member,'wrong')).status,403);
  assert.equal((await register(member,token)).status,200);
  assert.equal((await register(other,token)).status,200);
  assert.equal((await mf.dispatchFetch(`${origin}/u/${member.id}/mcp`)).status,503);
  for (const op of ['list','rotate','remove','delete']) assert.equal((await call(member,{op,id:other.id})).status,403);
  assert.equal((await call(member,{op:'me'})).status,200);
  assert.equal((await (await call(admin,{op:'list'})).json()).length,2);
  const envelope = await auth(member,{op:'me'});
  const post = body=>mf.dispatchFetch(`${origin}/control`,{method:'POST',body:JSON.stringify(body)});
  assert.equal((await post(envelope)).status,200);
  assert.equal((await post(envelope)).status,401);
  const forged = await auth(member,{op:'me'}); forged.payload = JSON.stringify({op:'list'});
  assert.equal((await post(forged)).status,401);
  const impersonation = await auth(other,{op:'connect',id:member.id});
  assert.equal((await mf.dispatchFetch(`${origin}/connect/${member.id}`,{headers:{Upgrade:'websocket','x-arc-auth':JSON.stringify(impersonation)}})).status,403);
  const response = await mf.dispatchFetch(`${origin}/connect/${member.id}`,{headers:{Upgrade:'websocket','x-arc-auth':JSON.stringify(await auth(member,{op:'connect',id:member.id}))}});
  assert.equal(response.status,101); ws=response.webSocket; ws.accept(); next=messages(ws);
  assert.equal((await next()).type,'ready');
  ws.send('ping'); assert.equal(await next(),'pong');
});
test('streamed binary request and SSE response preserve headers, discovery paths and cancellation', async () => {
  const body = new Uint8Array(70000).fill(123); body[0]=0; body[69999]=255;
  const responsePromise = mf.dispatchFetch(`${origin}/u/${member.id}/oauth/token?x=%2F`,{method:'POST',headers:{'content-type':'application/octet-stream','x-test':'same'},body});
  const request = await next(); assert.equal(request.path,'/oauth/token?x=%2F'); assert.equal(request.method,'POST');
  assert.ok(request.headers.some(([k,v])=>k==='x-test' && v==='same'));
  const chunks=[];
  while (true) { const frame=await next(); if(frame.type==='request-end') break; assert.equal(frame.type,'request-chunk'); chunks.push(Buffer.from(frame.data,'base64')); ws.send(JSON.stringify({type:'request-credit',id:request.id})); }
  assert.deepEqual(Buffer.concat(chunks),Buffer.from(body));
  ws.send(JSON.stringify({type:'response',id:request.id,status:200,headers:[['content-type','text/event-stream'],['x-test','preserved']]}));
  const response=await responsePromise; assert.equal(response.headers.get('x-test'),'preserved');
  const reader=response.body.getReader(); const first=reader.read();
  assert.equal((await next()).type,'response-credit');
  ws.send(JSON.stringify({type:'response-chunk',id:request.id,data:Buffer.from('data: one\n\n').toString('base64')}));
  assert.equal(new TextDecoder().decode((await first).value),'data: one\n\n');
  // First chunk is visible before the response finishes.
  const second=reader.read(); assert.equal((await next()).type,'response-credit');
  ws.send(JSON.stringify({type:'response-chunk',id:request.id,data:Buffer.from('data: two\n\n').toString('base64')}));
  assert.equal(new TextDecoder().decode((await second).value),'data: two\n\n');
  const end=reader.read(); await next(); ws.send(JSON.stringify({type:'response-end',id:request.id})); assert.equal((await end).done,true); assert.equal((await next()).type,'cancel');
  for (const [path,local] of [[`/.well-known/oauth-protected-resource/u/${member.id}/mcp`,'/.well-known/oauth-protected-resource/mcp'],[`/.well-known/oauth-authorization-server/u/${member.id}`,'/.well-known/oauth-authorization-server'],[`/u/${member.id}/oauth/authorize`,'/oauth/authorize']]) {
    const promise=mf.dispatchFetch(origin+path); const frame=await next(); assert.equal(frame.path,local); assert.equal((await next()).type,'request-end');
    ws.send(JSON.stringify({type:'response',id:frame.id,status:204,headers:[]})); assert.equal((await promise).status,204); assert.equal((await next()).type,'cancel');
  }
  const endpoint = new URL(`/u/${member.id}/mcp`,await mf.ready);
  const disconnected = new Promise((resolve,reject)=> {
    http.get(endpoint,{agent:false},response=>response.once('data',()=> {
      // Use an abortive TCP close; a half-close permits the server to finish its response.
      response.socket.resetAndDestroy(); resolve();
    })).on('error',reject);
  });
  const frame=await next(); await next();
  ws.send(JSON.stringify({type:'response',id:frame.id,status:200,headers:[['content-type','text/event-stream']]}));
  assert.equal((await next()).type,'response-credit');
  ws.send(JSON.stringify({type:'response-chunk',id:frame.id,data:Buffer.from('data: hello\n\n').toString('base64')}));
  await disconnected;
  let cancel=await next(); if(cancel.type==='response-credit') cancel=await next();
  assert.equal(cancel.type,'cancel');

});
test('rotation preserves members; removal closes active requests and prevents shared rejoin; leave is self-only', async () => {
  const newToken = (await (await call(admin,{op:'rotate'})).json()).token;
  assert.notEqual(newToken,token); assert.equal((await register(identity(),token)).status,403);
  assert.equal((await call(member,{op:'me'})).status,200);
  const listed=await (await call(admin,{op:'list'})).json(); assert.ok(listed.find(m=>m.id===member.id).online); assert.ok(listed[0].joinedAt);
  const pending=mf.dispatchFetch(`${origin}/u/${member.id}/mcp`); await next(); await next();
  assert.equal((await call(admin,{op:'remove',id:member.id})).status,200);
  assert.equal((await pending).status,503);
  assert.equal((await mf.dispatchFetch(`${origin}/u/${member.id}/mcp`)).status,404);
  assert.equal((await register(member,newToken)).status,403);
  assert.equal((await call(other,{op:'leave',id:member.id})).status,200);
  assert.equal((await call(other,{op:'me'})).status,403);
  assert.equal((await register(other,newToken)).status,200);
  assert.equal((await call(admin,{op:'delete'})).status,200);
  assert.equal((await mf.dispatchFetch(`${origin}/u/${other.id}/mcp`)).status,410);
  assert.equal((await call(admin,{op:'delete'})).status,200);
  assert.equal((await call(other,{op:'me'})).status,410);
});
