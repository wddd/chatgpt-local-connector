import type { ProviderAccount } from '../../../types';
import { SensitiveIdentity } from '../../Sensitive';
import type { ControlSource } from '../../../state/types';
import type { ProviderSnapshot } from '../../../subscriptions/types';
import { accountPlatform } from '../../../accountPresentation';
import { PlatformIcon, Tag } from '../../ui';
export function AccountIdentity({ account }: { account: ProviderAccount }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"><SensitiveIdentity email={account.email} orgName={account.orgName} wrap />{account.plan && <>{(account.email || account.orgName) && <span aria-hidden="true"> · </span>}<Tag>{account.plan}</Tag></>}</div>;
}
export function accountProfiles(account: Pick<ProviderAccount, 'agentProfiles'>, agent?: string) {
  return account.agentProfiles.filter(profile => !agent || profile.agent === agent);
}

export function AccountIdentityIcon({ account, sources, providers }: { account: ProviderAccount; sources: ControlSource[]; providers: ProviderSnapshot[] }) {
  const platform = accountPlatform(account, sources, providers);
  return <span className="inline-grid size-9 shrink-0 place-items-center" aria-hidden="true"><PlatformIcon size={36} role={platform.source ? 'source' : 'agent'} platform={platform.source ?? platform.agent} /></span>;
}
