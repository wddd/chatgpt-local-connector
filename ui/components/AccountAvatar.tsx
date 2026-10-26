import type { ProviderAccount } from '../types';
import { connector } from '../state/connector';
import { subscriptions } from '../state/subscriptions';
import { accountPlatform } from '../accountPresentation';
import { PlatformIcon } from './ui';

export default function AccountAvatar({ account }: { account: ProviderAccount }) {
  const { sources } = connector.use(), { snapshot } = subscriptions.use();
  const platform = accountPlatform(account, sources, snapshot?.providers ?? []);
  return <span className="account-avatar" aria-hidden="true">{platform.source ? <PlatformIcon role="source" platform={platform.source} />
    : <PlatformIcon role="agent" platform={platform.agent} />}</span>;
}
