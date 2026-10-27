import './agent-account.css';
import type { ProviderAccount } from '../../../types';
import { SensitiveIdentity } from '../../Sensitive';
import type { ControlSource } from '../../../state/types';
import type { ProviderSnapshot } from '../../../subscriptions/types';
import { accountPlatform } from '../../../accountPresentation';
import { PlatformIcon, Tag } from '../../ui';
export function AccountIdentity({ account }: { account: ProviderAccount }) {
  return <div className="account-detail-meta"><SensitiveIdentity email={account.email} orgName={account.orgName} wrap />{account.plan && <>{(account.email || account.orgName) && <span aria-hidden="true"> · </span>}<Tag>{account.plan}</Tag></>}</div>;
}
export function accountProfiles(account: Pick<ProviderAccount, 'agentProfiles'>, agent?: string) {
  return account.agentProfiles.filter(profile => !agent || profile.agent === agent);
}

export function AccountIdentityIcon({ account, sources, providers }: { account: ProviderAccount; sources: ControlSource[]; providers: ProviderSnapshot[] }) {
  const platform = accountPlatform(account, sources, providers);
  return <span className="account-avatar" aria-hidden="true"><PlatformIcon role={platform.source ? 'source' : 'agent'} platform={platform.source ?? platform.agent} /></span>;
}
