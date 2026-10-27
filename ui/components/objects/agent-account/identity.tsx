import type { ProviderAccount } from '../../../types';
import { SensitiveIdentity } from '../../Sensitive';
import { Tag } from '../../ui';
export function AccountIdentity({ account }: { account: ProviderAccount }) {
  const email = account.email?.trim(), org = account.orgName?.trim();
  const orgName = email && org?.toLocaleLowerCase().startsWith(email.toLocaleLowerCase()) ? undefined : account.orgName;
  return <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"><SensitiveIdentity email={account.email} orgName={orgName} wrap />{account.plan && <>{(account.email || account.orgName) && <span aria-hidden="true"> · </span>}<Tag>{account.plan}</Tag></>}</div>;
}
export function accountProfiles(account: Pick<ProviderAccount, 'agentProfiles'>, agent?: string) {
  return account.agentProfiles.filter(profile => !agent || profile.agent === agent);
}
