import type { Account, AccountKind, AccountLogin } from './accounts';
import type { Status, ControlSource } from './state/types';
// Stateful management fixture. Unknown operations must never reach Core.
export function accountScenario(status: Status, sources: ControlSource[]) {
  const now = new Date().toISOString();
  const primary = status.ingresses[0];
  primary.url = 'https://arc.example.com/mcp';
  const chatgpt: ControlSource = { ...sources[0], id: 'example-chatgpt-source', ingressId: 'example-chatgpt-connection', product: 'chatgpt', platform: 'openai', label: 'Personal', credential: { type: 'ingress' } };
  sources.push(chatgpt);
  status.ingresses.push({ ...primary, id: chatgpt.ingressId, name: 'ChatGPT connection', transport: 'openai-tunnel', auth: 'openai', controlSource: 'chatgpt', sources: [chatgpt], url: 'https://chatgpt.example.com/mcp', oauth: { pending: [], grants: [] } });
  status.ingresses.push({ ...primary, id: 'example-spare-connection', name: 'Spare connection', transport: 'https', auth: 'oauth', sources: [], url: 'https://spare.example.com/mcp', oauth: { pending: [], grants: [] } });
  let accounts: Account[] = [
    { id: 'account-claude', provider: 'anthropic', identityKey: 'example-claude-identity', alias: 'Studio', email: 'alex@example.com', orgName: 'Example Studio', plan: 'Max', createdAt: now, observedAt: now, sources: [sources[0].id], agentProfiles: [{ agent: 'claude', profileId: 'profile-claude', kind: 'cli-profile', state: 'signed-in', default: true }], notifications: { state: 'verified', sessions: [{ id: 'example-session-1', name: 'Release planning', lastDelivery: now }] }, quota: { windows: [{ id: 'five-hour', label: '5 h', usedPercent: 37, resetsAt: new Date(Date.now() + 7200000).toISOString() }, { id: 'weekly', label: '7 d', usedPercent: 68, resetsAt: new Date(Date.now() + 259200000).toISOString() }] } },
    { id: 'account-openai', provider: 'openai', identityKey: 'example-openai-identity', alias: 'Personal', email: 'jordan@example.com', orgName: 'Example Lab', plan: 'Plus', createdAt: now, observedAt: now, sources: [chatgpt.id], agentProfiles: [{ agent: 'codex', profileId: 'profile-codex', kind: 'codex-home', state: 'signed-in', default: true }], notifications: { state: 'mcp-events', sessions: [] }, quota: { windows: [{ id: 'weekly', label: '7 d', usedPercent: 24, resetsAt: new Date(Date.now() + 86400000).toISOString() }] } },
    { id: 'account-review', provider: 'anthropic', identityKey: 'example-review-identity', alias: 'Review', email: 'review@example.com', orgName: 'Example Review', createdAt: now, observedAt: now, sources: [], agentProfiles: [{ agent: 'claude', profileId: 'profile-review', kind: 'cli-profile', state: 'signed-out', default: false }], notifications: { state: 'not-bound', sessions: [] }, quota: { windows: [] } },
  ];
  let polls = 0;
  let login: AccountLogin | undefined, loginKind: AccountKind = 'claude', loginAccount: string | undefined;
  const requireAccount = (id: string) => { const account = accounts.find(a => a.id === id); if (!account) throw new Error('ACCOUNT_NOT_FOUND'); return account; };
  return (path: string, method: string, raw?: unknown) => {
    const url = new URL(path, 'https://example.com/'), route = url.pathname.slice(1);
    const body = (raw ?? {}) as Record<string, string>;
    if (route === 'accounts' && method === 'GET') {
      const id = url.searchParams.get('id');
      return id ? requireAccount(id) : { accounts: accounts.map(({ email, orgName, ...account }) => account) };
    }
    if (route === 'accounts/browsers' && method === 'GET') return { browsers: [{ id: 'safari', name: 'Safari' }, { id: 'chrome', name: 'Chrome' }, { id: 'firefox', name: 'Firefox' }] };
    if (['accounts/add', 'accounts/reauth'].includes(route) && method === 'POST') {
      polls = 0;
      loginKind = (body.kind ?? body.agent) as AccountKind; loginAccount = body.id;
      login = { loginId: 'example-login', state: 'waiting', loginUrl: 'https://login.example.com/authorize' };
      return login;
    }
    if (route === 'accounts/login') {
      if (!login || (body.loginId ?? url.searchParams.get('loginId')) !== login.loginId) throw new Error('LOGIN_NOT_FOUND');
      if (method === 'POST' && body.action === 'cancel') { login.state = 'cancelled'; return login; }
      if (method === 'POST' && body.action === 'code' || method === 'GET' && login.state === 'waiting' && ++polls >= 4) {
        if (method === 'POST' && !body.code?.trim()) throw new Error('LOGIN_CODE_REQUIRED');
        const agent = loginKind === 'detect' ? 'codex' : loginKind === 'api-key' ? 'dsh' : loginKind;
        let account = loginAccount ? requireAccount(loginAccount) : accounts.find(a => a.id === (agent === 'claude' ? 'account-claude' : agent === 'codex' ? 'account-openai' : 'account-key'));
        const matchedExisting = !!account;
        if (!account) { account = { id: 'account-key', provider: 'deepseek', identityKey: 'example-key-identity', alias: 'API', createdAt: now, observedAt: now, sources: [], agentProfiles: [{ agent, profileId: 'example-api-profile', kind: 'api-key', state: 'signed-in', default: false }], notifications: { state: 'n/a', sessions: [] }, quota: { windows: [] } }; accounts.push(account); }
        account.agentProfiles.forEach(p => { if (p.agent === agent) p.state = 'signed-in'; });
        login = { ...login, state: 'completed', accountId: account.id, matchedExisting };
      }
      return login;
    }
    if (route.startsWith('accounts/')) {
      if (method !== 'POST') throw new Error(`SCENARIO_ACTION_UNAVAILABLE: ${path}`);
      const account = requireAccount(body.id);
      if (route === 'accounts/update') {
        if (body.alias !== undefined) { if (!body.alias.trim()) throw new Error('ACCOUNT_ALIAS_REQUIRED'); account.alias = body.alias; }
        if (body.defaultFor) accounts.forEach(a => a.agentProfiles.forEach(p => { if (p.agent === body.defaultFor) p.default = a.id === account.id; }));
      } else if (route === 'accounts/remove') accounts = accounts.filter(a => a.id !== account.id);
      else if (route === 'accounts/bind') { account.notifications = { state: 'not-bound', sessions: [{ id: body.target, name: body.target }] }; }
      else if (route === 'accounts/test') { account.notifications.state = account.provider === 'openai' ? 'mcp-events' : 'verified'; account.notifications.sessions.forEach(s => s.lastDelivery = new Date().toISOString()); }
      else throw new Error(`SCENARIO_ACTION_UNAVAILABLE: ${path}`);
      return { ok: true };
    }
    const switchMatch = route.match(/^source\/([^/]+)\/switch$/);
    if (switchMatch && ['POST', 'DELETE'].includes(method)) {
      const source = sources.find(s => s.id === switchMatch[1]); if (!source) throw new Error('SOURCE_NOT_FOUND');
      if (method === 'POST') {
        const target = status.ingresses.find(i => i.id === body.ingressId); if (!target) throw new Error('INGRESS_NOT_FOUND');
        status.ingresses.forEach(i => { i.sources = i.sources?.filter(s => s.id !== source.id); });
        source.ingressId = target.id; source.state = 'connected'; target.sources = [...(target.sources ?? []), source];
      }
      source.pendingSwitch = undefined;
      return { source };
    }
    const sourceMatch = route.match(/^source\/([^/]+)(\/disconnect)?$/);
    if (sourceMatch && method !== 'GET') {
      const source = sources.find(s => s.id === sourceMatch[1]); if (!source) throw new Error('SOURCE_NOT_FOUND');
      if (sourceMatch[2] && method === 'POST') source.state = 'revoked';
      else if (method === 'PUT') { if (body.label) source.label = body.label; if (body.product) source.product = body.product; }
      else throw new Error(`SCENARIO_ACTION_UNAVAILABLE: ${path}`);
      return { source };
    }
    const ingressMatch = route.match(/^ingress\/([^/]+)$/);
    if (ingressMatch && method === 'PUT') {
      const ingress = status.ingresses.find(i => i.id === ingressMatch[1]); if (!ingress) throw new Error('INGRESS_NOT_FOUND');
      if (typeof raw === 'object' && raw && 'enabled' in raw) ingress.enabled = !!raw.enabled;
      return ingress;
    }
    return undefined;
  };
}
