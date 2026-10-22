import { DurableObject } from 'cloudflare:workers';

interface Env {
  REGISTRY: DurableObjectNamespace<Registry>;
  INSTANCES: DurableObjectNamespace<Instance>;
  MANAGEMENT_PUBLIC_KEY: string;
  ARC_VERSION: string;
}
type Member = { id: string; publicKey: string; name: string; joinedAt: string; lastOnline: string | null; removed?: boolean };
type Envelope = { publicKey: string; challenge: string; signature: string; payload: string };
const CHUNK = 32768;
const encoder = new TextEncoder();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
function fail(message: string, status = 400): never { throw json({ error: message }, status); }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function digest(value: BufferSource) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export function route(path: string): { id: string; path: string } | null {
  const match = /^(\/\.well-known\/(?:oauth-protected-resource|oauth-authorization-server))?\/u\/([a-f0-9]{64})(\/.*)?$/.exec(path);
  if (!match) return null;
  return { id: match[2], path: `${match[1] || ''}${match[3] || (match[1] ? '' : '/')}` };
}
// Hop-by-hop fields are never replayed over another HTTP connection.
export function headers(input: Headers): [string, string][] {
  const connection = (input.get('connection') || '').toLowerCase().split(',').map(s => s.trim());
  return [...input].filter(([k]) => !['connection', 'upgrade', 'keep-alive', 'transfer-encoding', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', ...connection].includes(k));
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const target = route(new URL(request.url).pathname);
      const registry = env.REGISTRY.getByName('registry');
      if (!target) return await registry.fetch(request);
      const status = await registry.lookup(target.id);
      if (status !== 200) return json({ error: status === 410 ? 'Relay deleted' : 'Instance removed or not registered' }, status);
      const instance = env.INSTANCES.getByName(target.id);
      const id = crypto.randomUUID();
      const forwarded = new Request(request);
      forwarded.headers.set('x-arc-request-id', id);
      // Explicit RPC cancellation also covers response bodies awaiting their next SSE event.
      request.signal.addEventListener('abort', () => ctx.waitUntil(instance.cancelRequest(id)), { once: true });
      return await instance.fetch(forwarded);
    } catch (e) { return e instanceof Response ? e : json({ error: 'Relay request failed' }, 500); }
  },
};

export class Registry extends DurableObject<Env> {
  serialized(action: () => Promise<Response>): Promise<Response> {
    // Authentication errors are responses, not failed concurrency gates (which reset a DO).
    return this.ctx.blockConcurrencyWhile(async () => {
      try { return await action(); }
      catch (e) { return e instanceof Response ? e : json({ error: 'Invalid relay request' }, 400); }
    });
  }
  async fetch(request: Request): Promise<Response> {
    try { return await this.dispatch(request); }
    catch (e) { return e instanceof Response ? e : json({ error: 'Invalid relay request' }, 400); }
  }
  async dispatch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!this.env.MANAGEMENT_PUBLIC_KEY) return json({ error: 'Relay management key not configured' }, 503);
    if (url.pathname === '/challenge' && request.method === 'POST') {
      return this.serialized(async () => {
        const entries = await this.ctx.storage.list<number>({ prefix: 'challenge:' });
        const expired = [...entries].filter(([, expires]) => expires < Date.now()).map(([key]) => key);
        if (expired.length) await this.ctx.storage.delete(expired);
        if (entries.size - expired.length >= 1024) return json({ error: 'Too many authentication attempts' }, 429);
        const challenge = random();
        await this.ctx.storage.put(`challenge:${challenge}`, Date.now() + 60_000);
        return json({ challenge, version: this.env.ARC_VERSION });
      });
    }
    const connecting = /^\/connect\/[a-f0-9]{64}$/.test(url.pathname) && request.method === 'GET';
    if ((url.pathname === '/control' && request.method === 'POST') || connecting) {
      const raw = connecting ? request.headers.get('x-arc-auth') || '' : await readText(request, 16384);
      if (raw.length > 16384) fail('Authentication payload too large');
      const envelope: Envelope = JSON.parse(raw);
      return this.serialized(async () => {
        const { publicKey, challenge, signature, payload } = envelope;
        const expiry = await this.ctx.storage.get<number>(`challenge:${challenge}`);
        await this.ctx.storage.delete(`challenge:${challenge}`);
        if (!expiry || expiry < Date.now()) fail('Challenge expired or already used', 401);
        const keyBytes = decode(publicKey);
        if (keyBytes.length !== 32) fail('Invalid public key', 401);
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'Ed25519' }, false, ['verify']);
        const message = `arc-relay-v1\n${url.origin}\n${challenge}\n${await digest(encoder.encode(payload))}`;
        if (!await crypto.subtle.verify('Ed25519', key, decode(signature), encoder.encode(message))) fail('Invalid signature', 401);
        const input = JSON.parse(payload);
        const admin = publicKey === this.env.MANAGEMENT_PUBLIC_KEY;
        if (await this.ctx.storage.get('deleted')) {
          // The owner may retry deletion after a lost reply; no data-plane route reopens.
          return admin && input.op === 'delete' && !connecting ? json({ deleted: true }) : json({ error: 'Relay deleted' }, 410);
        }
        const ownId = await digest(keyBytes);
        const member = await this.ctx.storage.get<Member>(`member:${ownId}`);
        if (connecting) {
          if (input.op !== 'connect' || input.id !== ownId || url.pathname !== `/connect/${ownId}` || !member || member.removed) fail('Instance not registered', 403);
          if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') fail('Expected WebSocket upgrade');
          const response = await this.env.INSTANCES.getByName(ownId).fetch(new Request('https://instance/connect', { headers: { upgrade: 'websocket' } }));
          if (response.status === 101) {
            member.lastOnline = new Date().toISOString();
            await this.ctx.storage.put(`member:${ownId}`, member);
          }
          return response;
        }
        switch (input.op) {
          case 'register': {
            const bytes = decode(input.publicKey);
            if (bytes.length !== 32 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) fail('Invalid instance');
            const id = await digest(bytes);
            const stored = await this.ctx.storage.get<Member>(`member:${id}`);
            const previous = stored?.removed ? undefined : stored;
            if (!admin) {
              if (publicKey !== input.publicKey) fail('Instance registration denied', 403);
              const token = await this.ctx.storage.get<string>('tokenHash');
              if (!token || typeof input.token !== 'string' || await digest(encoder.encode(input.token)) !== token) fail('Invalid shared token', 403);
            }
            const next: Member = { id, publicKey: input.publicKey, name: input.name.trim(), joinedAt: previous?.joinedAt || new Date().toISOString(), lastOnline: previous?.lastOnline || null };
            await this.env.INSTANCES.getByName(id).fetch('https://instance/enable', { method: 'POST' });
            await this.ctx.storage.put(`member:${id}`, next);
            return json(next);
          }
          case 'me':
            if (!member || member.removed) fail('Instance not registered', 403);
            return json(await this.describe(member));
          case 'leave':
            if (member && !member.removed) await this.remove(member, false);
            return json({ left: true });
        }
        if (!admin) fail('Management signature required', 403);
        switch (input.op) {
          case 'list': {
            const members = await this.ctx.storage.list<Member>({ prefix: 'member:' });
            return json(await Promise.all([...members.values()].filter(m => !m.removed).map(m => this.describe(m))));
          }
          case 'remove': {
            const target = await this.ctx.storage.get<Member>(`member:${input.id}`);
            if (!target) fail('Instance not found', 404);
            await this.remove(target, true);
            return json({ removed: input.id });
          }
          case 'rotate': {
            const token = random();
            await this.ctx.storage.put('tokenHash', await digest(encoder.encode(token)));
            return json({ token });
          }
          case 'delete': {
            // Tombstone first; even interrupted cleanup cannot reopen any public address.
            await this.ctx.storage.put('deleted', true);
            const members = await this.ctx.storage.list<Member>({ prefix: 'member:' });
            await Promise.all([...members.values()].map(m => this.remove(m, true)));
            await this.ctx.storage.delete('tokenHash');
            return json({ deleted: true });
          }
          default: fail('Unknown operation');
        }
      });
    }
    return json({ error: 'Unknown relay address' }, 404);
  }
  async lookup(id: string): Promise<number> {
    if (await this.ctx.storage.get('deleted')) return 410;
    const member = await this.ctx.storage.get<Member>(`member:${id}`);
    return member && !member.removed ? 200 : 404;
  }

  async describe(member: Member) {
    const status = await this.env.INSTANCES.getByName(member.id).fetch('https://instance/status').then(r => r.json<{ online: boolean; lastOnline: string | null }>());
    return { ...member, ...status, lastOnline: status.lastOnline || member.lastOnline };
  }
  async remove(member: Member, revoked: boolean) {
    member.removed = true;
    await this.ctx.storage.put(`member:${member.id}`, member);
    await this.env.INSTANCES.getByName(member.id).fetch('https://instance/disable', { method: 'POST' });
    if (!revoked) await this.ctx.storage.delete(`member:${member.id}`);
  }
}
async function readText(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) fail('Request too large', 413);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

type Pending = {
  ws: WebSocket; resolve: (response: Response) => void; writer?: WritableStreamDefaultWriter<Uint8Array>;
  credit?: () => void; rejectCredit?: (e: Error) => void; responseCredit: boolean; started: boolean;
  head: boolean; timer: ReturnType<typeof setTimeout>; reader?: ReadableStreamDefaultReader<Uint8Array>;
};
export class Instance extends DurableObject<Env> {
  pending = new Map<string, Pending>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Idle connections need no JS timers and survive eviction with their attachments.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'instance') {
      if (url.pathname === '/enable') { await this.ctx.storage.put('enabled', true); return json({ ok: true }); }
      if (url.pathname === '/disable') {
        await this.ctx.storage.put('enabled', false);
        for (const ws of this.ctx.getWebSockets()) { this.disconnect(ws); ws.close(4003, 'Instance removed'); }
        return json({ ok: true });
      }
      if (url.pathname === '/status') {
        const sockets = this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN);
        const times = sockets.map(ws => this.ctx.getWebSocketAutoResponseTimestamp(ws)?.toISOString()).filter((s): s is string => !!s);
        return json({ online: sockets.length > 0, lastOnline: times.sort().at(-1) || await this.ctx.storage.get('lastOnline') || null });
      }
      if (url.pathname === '/connect') {
        if (!await this.ctx.storage.get('enabled')) return json({ error: 'Instance removed' }, 403);
        for (const ws of this.ctx.getWebSockets()) { this.disconnect(ws); ws.close(4001, 'Replaced'); }
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({ connectedAt: new Date().toISOString() });
        await this.ctx.storage.put('lastOnline', new Date().toISOString());
        pair[1].send(JSON.stringify({ type: 'ready', version: this.env.ARC_VERSION }));
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
    }
    if (!await this.ctx.storage.get('enabled')) return json({ error: 'Instance removed' }, 404);
    const ws = this.ctx.getWebSockets().find(ws => ws.readyState === WebSocket.OPEN);
    if (!ws) return json({ error: 'ARC instance offline. Start ARC on this computer to reconnect.' }, 503);
    const target = route(url.pathname);
    if (!target) return json({ error: 'Invalid relay route' }, 404);
    if (this.pending.size >= 64) return json({ error: 'Instance busy' }, 503);
    const id = request.headers.get('x-arc-request-id') || crypto.randomUUID();
    const result = new Promise<Response>(resolve => {
      this.pending.set(id, { ws, resolve, head: request.method === 'HEAD', started: false, responseCredit: false,
        timer: setTimeout(() => this.finish(id, 'ARC response headers timed out', 504), 30_000) });
    });
    request.signal.addEventListener('abort', () => this.finish(id, 'Client disconnected'), { once: true });
    ws.send(JSON.stringify({ type: 'request', id, method: request.method, path: target.path + url.search, headers: headers(request.headers).filter(([key]) => key !== 'x-arc-request-id') }));
    void this.upload(id, request).catch(() => this.finish(id, 'Request stream interrupted', 502));
    // An in-flight HTTP stream keeps this object active; only idle sockets hibernate.
    return result;
  }
  async upload(id: string, request: Request) {
    const p = this.pending.get(id)!;
    p.reader = request.body?.getReader();
    const send = (value: unknown) => p.ws.send(JSON.stringify(value));
    while (p.reader) {
      const { done, value } = await p.reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += CHUNK) {
        if (!this.pending.has(id)) return;
        const acknowledged = new Promise<void>((resolve, reject) => { p.credit = resolve; p.rejectCredit = reject; });
        send({ type: 'request-chunk', id, data: encode(value.subarray(offset, offset + CHUNK)) });
        await acknowledged;
      }
    }
    if (this.pending.has(id)) send({ type: 'request-end', id });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      if (typeof message !== 'string' || message.length > CHUNK * 2) throw Error('Invalid frame');
      const frame = JSON.parse(message);
      const p = this.pending.get(frame.id);
      if (!p || p.ws !== ws) return;
      switch (frame.type) {
        case 'request-credit': { const credit = p.credit; p.credit = undefined; p.rejectCredit = undefined; credit?.(); break; }
        case 'response': {
          if (p.started || !Number.isInteger(frame.status) || frame.status < 200 || frame.status > 599) throw Error('Invalid response');
          p.started = true;
          clearTimeout(p.timer);
          p.timer = setTimeout(() => this.finish(frame.id, 'Relay request lifetime exceeded', 504), 31 * 60_000);
          const noBody = p.head || [204, 205, 304].includes(frame.status);
          const stream = new IdentityTransformStream();
          p.writer = stream.writable.getWriter();
          void p.writer.closed.catch(() => this.finish(frame.id, 'Client disconnected'));
          const response = new Response(noBody ? null : stream.readable, {
            status: frame.status, headers: headers(new Headers(frame.headers)), encodeBody: 'manual',
          });
          if (!noBody) {
            p.responseCredit = true;
            ws.send(JSON.stringify({ type: 'response-credit', id: frame.id }));
          }
          p.resolve(response);
          if (noBody) this.finish(frame.id);
          break;
        }
        case 'response-chunk': {
          const data = decode(frame.data);
          if (!p.started || !p.responseCredit || data.length > CHUNK) throw Error('Response credit exceeded');
          p.responseCredit = false;
          try { await p.writer!.write(data); }
          catch { this.finish(frame.id, 'Client disconnected'); return; }
          if (this.pending.has(frame.id)) {
            p.responseCredit = true;
            ws.send(JSON.stringify({ type: 'response-credit', id: frame.id }));
          }
          break;
        }
        case 'response-end': this.finish(frame.id); break;
        case 'error': this.finish(frame.id, 'ARC request failed', 502); break;
        default: throw Error('Unknown frame');
      }
    } catch { this.disconnect(ws); ws.close(1002, 'Invalid relay frame'); }
  }
  finish(id: string, error?: string, status = 502) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    p.rejectCredit?.(Error(error || 'Request completed'));
    void p.reader?.cancel().catch(() => {});
    if (!p.started) p.resolve(json({ error: error || 'ARC response missing' }, status));
    if (p.writer) void (error ? p.writer.abort(Error(error)) : p.writer.close()).catch(() => {});
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify({ type: 'cancel', id }));
  }
  async cancelRequest(id: string) { this.finish(id, 'Client disconnected'); }
  disconnect(ws: WebSocket) { for (const [id, p] of this.pending) if (p.ws === ws) this.finish(id, 'ARC instance disconnected', 503); }
  async webSocketClose(ws: WebSocket) { this.disconnect(ws); await this.ctx.storage.put('lastOnline', new Date().toISOString()); ws.close(); }
  async webSocketError(ws: WebSocket) { this.disconnect(ws); await this.ctx.storage.put('lastOnline', new Date().toISOString()); ws.close(1011, 'Connection failed'); }
}
