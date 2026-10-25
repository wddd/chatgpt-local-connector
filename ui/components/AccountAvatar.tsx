import { Bot } from 'lucide-react';
import type { ProviderAccount } from '../types';
import { connector } from '../state/connector';
import { subscriptions } from '../state/subscriptions';
import { icons } from '../state/agents';
import { accountPlatform } from '../accountPresentation';
import SourceIcon from './SourceIcon';
import { Icon } from './ui';

export default function AccountAvatar({ account }: { account: ProviderAccount }) {
  const { sources } = connector.use(), { snapshot } = subscriptions.use();
  const platform = accountPlatform(account, sources, snapshot?.providers ?? []);
  return <span className="account-avatar" aria-hidden="true">{platform.source ? <SourceIcon platform={platform.source} />
    : icons[platform.agent] ? <span className="agent-logo" dangerouslySetInnerHTML={{ __html: icons[platform.agent] }} /> : <Icon icon={Bot} />}</span>;
}
