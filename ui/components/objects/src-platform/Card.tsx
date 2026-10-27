import type { ReactNode } from 'react';
import type { ControlSource, Ingress } from '../../../state/types';
import type { ProviderAccount } from '../../../types';
import { controlSource } from '../../../controlSources';
import { t } from '../../../i18n';
import { Button, Empty, EntityCard, Loading, Notice, PlatformIcon } from '../../ui';
import { SrcAccountRow } from '../src-account/Row';

export function SrcPlatformCard({ product, sources, accounts, ingresses, onSource, onConnection, onAdd, onLink, headerActions, loading, error }: {
  product: string; sources: readonly ControlSource[]; accounts: readonly ProviderAccount[]; ingresses: readonly Ingress[];
  onSource?: (source: ControlSource) => void; onConnection?: (id: string) => void; onAdd?: () => void; onLink?: (url: string) => void;
  headerActions?: ReactNode; loading?: boolean; error?: string;
}) {
  const info = controlSource(product), entries = sources.filter(source => source.product === product);
  const count = new Set(entries.map(source => accounts.find(account => account.sources.includes(source.id))?.id ?? source.id)).size;
  return <EntityCard className="object-card" title={info?.displayName ?? product} icon={<PlatformIcon role="source" platform={product} />}
    headerActions={<>{headerActions}{onAdd && <Button disabled={loading} onClick={onAdd}>{t('accounts.add')}</Button>}</>} aria-busy={loading}>
    {loading && <Loading />}{error && <Notice>{error}</Notice>}
    <span className="muted">{t('accounts.count', { count })}</span>
    {entries.map(source => <SrcAccountRow key={source.id} source={source} account={accounts.find(account => account.sources.includes(source.id) && entries.filter(entry => account.sources.includes(entry.id)).length === 1)}
      ingress={ingresses.find(ingress => ingress.id === source.ingressId)} onOpen={onSource ? () => onSource(source) : undefined} onConnection={onConnection} />)}
    {!entries.length && !loading && <Empty>{t('source.empty')}</Empty>}
    {info?.setup?.url && onLink && <Button variant="link" onClick={() => onLink(info.setup!.url)}>{t('connect.openSettings', { name: info.shortName })}</Button>}
    {info?.docs[0] && onLink && <Button variant="link" onClick={() => onLink(info.docs[0])}>{t('source.documentation')}</Button>}
  </EntityCard>;
}
