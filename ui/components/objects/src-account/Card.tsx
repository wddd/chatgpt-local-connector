import type { ReactNode } from 'react';
import type { ControlSource, Ingress } from '../../../state/types';
import type { ProviderAccount } from '../../../types';
import { t } from '../../../i18n';
import { sourceDate } from '../../../sourcePresentation';
import { EntityCard, FactList, Freshness, Notice, PlatformIcon, StateBadge } from '../../ui';
import { AccountIdentity } from '../agent-account/identity';
import { SourceAuthorizationChip } from '../authorization-request/SourceChip';
import { AuthorizationRequestRow } from '../authorization-request/Row';
import { statePresentation } from '../statePresentation';
import { TunnelChip } from '../tunnel/Chip';

export function SrcAccountCard({ source, account, product, ingress, ingresses = [], onAuthorization, onConnection, headerActions, children, footer, danger, loading, error }: {
  source?: ControlSource; account?: ProviderAccount; product?: string; ingress?: Ingress; ingresses?: readonly Ingress[];
  onAuthorization?: (ingressId: string, requestId: string) => void; onConnection?: (id: string) => void; headerActions?: ReactNode; children?: ReactNode; footer?: ReactNode; danger?: ReactNode; loading?: boolean; error?: string;
}) {
  const identity = source && account?.sourceIdentities?.[source.id];
  const connections = ingresses.length ? ingresses : ingress ? [ingress] : [];
  const pending = source ? connections.flatMap(connection => (connection.oauth?.pending ?? []).filter(request => request.status === 'pending' && (request.id === source.pendingSwitch?.requestId || request.sourceId === source.id || request.switchSourceId === source.id)).map(request => ({ connection, request }))) : [];
  const currentPending = pending.find(({ connection, request }) => connection.id === (source?.pendingSwitch?.ingressId ?? source?.ingressId) && request.id === (source?.pendingSwitch?.requestId ?? source?.credential.grantId));
  return <EntityCard className="object-card" aria-busy={loading} icon={<PlatformIcon role="source" platform={source?.product ?? product ?? ''} />}
    title={account?.alias ?? source?.label ?? t('accounts.identityUnavailable')}
    headerActions={<>{source && <StateBadge presentation={statePresentation('source', source.pendingSwitch ? 'pending-switch' : source.state)} />}{headerActions}</>} footer={footer} danger={danger}>
    {error && <Notice>{error}</Notice>}
    {account ? <AccountIdentity account={account} />
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
    {source && <SourceAuthorizationChip source={source} ingresses={connections} onOpen={currentPending && onAuthorization ? () => onAuthorization(currentPending.connection.id, currentPending.request.id) : undefined} />}
    {pending.map(({ connection, request }) => <AuthorizationRequestRow key={`${connection.id}:${request.id}`} request={request} source={source} disabled={!onAuthorization} onOpen={() => onAuthorization?.(connection.id, request.id)} />)}
    {children}
  </EntityCard>;
}
