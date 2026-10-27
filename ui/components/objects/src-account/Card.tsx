import type { ReactNode } from 'react';
import type { ControlSource, Ingress, OAuthRequest } from '../../../state/types';
import type { ProviderAccount } from '../../../types';
import { t } from '../../../i18n';
import { sourceDate } from '../../../sourcePresentation';
import { EntityCard, FactList, Freshness, Notice, PlatformIcon, StateBadge, Tag } from '../../ui';
import { SensitiveIdentity } from '../../Sensitive';
import { statePresentation } from '../statePresentation';
import { TunnelChip } from '../tunnel/Chip';
import { Reference } from '../Reference';

export function SrcAccountCard({ source, account, product, ingress, authorization, onAuthorization, onConnection, headerActions, children, footer, danger, loading, error }: {
  source?: ControlSource; account?: ProviderAccount; product?: string; ingress?: Ingress; authorization?: OAuthRequest;
  onAuthorization?: () => void; onConnection?: (id: string) => void; headerActions?: ReactNode; children?: ReactNode; footer?: ReactNode; danger?: ReactNode; loading?: boolean; error?: string;
}) {
  const identity = source && account?.sourceIdentities?.[source.id];
  return <EntityCard className="object-card" aria-busy={loading} icon={<PlatformIcon role="source" platform={source?.product ?? product ?? ''} />}
    title={account?.alias ?? source?.label ?? t('accounts.identityUnavailable')}
    headerActions={<>{source && <StateBadge presentation={statePresentation('source', source.pendingSwitch ? 'pending-switch' : source.state)} />}{headerActions}</>} footer={footer} danger={danger}>
    {error && <Notice>{error}</Notice>}
    {account ? <><SensitiveIdentity email={account.email} orgName={account.orgName} wrap />{account.plan && <Tag>{account.plan}</Tag>}</>
      : <p role="status" className="muted">{t(loading ? 'loading' : 'accounts.identityUnavailable')}</p>}
    {identity && identity.state !== 'resolved' && <Notice tone="warning">{t(identity.state === 'conflict' ? 'accounts.identityConflict' : 'accounts.unidentified')}</Notice>}
    {source && <>
      <FactList missing={{ placeholder: '—' }} items={[
        { label: t('source.label'), value: source.label },
        { label: t('source.authorizedAt'), value: sourceDate(source.connectedAt) },
        { label: t('source.lastSeen'), value: <Freshness observedAt={source.lastSeenAt ? new Date(source.lastSeenAt * 1000).toISOString() : undefined} age={sourceDate(source.lastSeenAt)} /> },
      ]} />
      <TunnelChip ingress={ingress} missingName={source.connectionName} onOpen={ingress && onConnection ? () => onConnection(ingress.id) : undefined} />
    </>}
    {authorization && <Reference onOpen={onAuthorization}><span>{t('source.authorization')}</span><StateBadge presentation={statePresentation('authorization', authorization.status)} variant="compact" /></Reference>}
    {children}
  </EntityCard>;
}
