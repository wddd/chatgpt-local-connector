import type { ProviderAccount } from './types';
import type { ControlSource } from './state/types';
import type { ProviderSnapshot } from './subscriptions/types';
import { name } from './state/agents';
import { controlSource } from './controlSources';
import { t } from './i18n';

export function accountOwns(account: Pick<ProviderAccount, 'id' | 'mergedAccountIds'>, id?: string | null) {
  return !!id && (account.id === id || account.mergedAccountIds?.includes(id) === true);
}

export function accountPlatform(account: ProviderAccount, sources: ControlSource[], providers: ProviderSnapshot[]) {
  const source = sources.find(source => account.sources.includes(source.id));
  const quota = providers.find(provider => provider.providerId === account.quotaProviderId);
  const agent = quota?.agentId ?? account.agentProfiles[0]?.agent;
  const vendor = (agent?: string) => agent ? ({ claude: 'anthropic', codex: 'openai', dsh: 'deepseek', gemini: 'google', antigravity: 'google', grok: 'xai' } as Record<string, string>)[agent] ?? agent : undefined;
  const id = account.provider !== 'other' ? account.provider : source?.platform ?? vendor(agent) ?? 'other';
  const known = ['anthropic', 'openai', 'deepseek', 'google', 'xai', 'other'].includes(id);
  const label = known ? t(`accounts.provider.${id}`) : controlSource(id)?.displayName ?? name({ agent: id });
  const logoSource = ({ anthropic: 'claude', openai: 'chatgpt', google: 'gemini', xai: 'grok' } as Record<string, string>)[id] ?? source?.product;
  return { id, label, source: logoSource, agent: agent ?? (id === 'deepseek' ? 'dsh' : id) };
}
