import type { ReactNode } from 'react';
import type { ControlSource, Ingress } from '../../../state/types';
import type { Relay } from '../../../state/relay';
import { connectionIcon, connectionKind, connectionProvider, ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { EntityCard, FactList, Icon, Notice, StateBadge } from '../../ui';
import Address from '../../Address';
import { statePresentation } from '../statePresentation';

export function TunnelCard({ ingress, relay, sources, headerActions, address, children, footer, danger, busy, error }: {
  ingress?: Ingress; relay?: Relay; sources: readonly ControlSource[]; headerActions?: ReactNode; address?: ReactNode; children?: ReactNode; footer?: ReactNode; danger?: ReactNode; busy?: boolean; error?: string;
}) {
  const count = ingress ? sources.filter(source => source.ingressId === ingress.id).length : undefined;
  return <EntityCard className="[&>.section-header]:flex-wrap [&>.section-header>.section-header-copy]:basis-30 [&>.section-header>.actions]:max-w-full" aria-busy={busy} icon={ingress ? <Icon icon={connectionIcon(ingress)} size={20} /> : undefined}
    title={ingress?.name ?? relay?.name ?? t('source.connectionRemoved')} headerActions={<><StateBadge presentation={statePresentation('connection', ingress ? ingressState(ingress) : 'unknown')} />{headerActions}</>}
    footer={footer} danger={danger}>
    {address !== undefined ? address : <Address value={ingress?.url ?? relay?.url ?? ''} label={t('source.copyAddress')} disabled={busy} placeholder="—" />}
    <FactList missing={{ omit: true }} items={[
      { label: t('connectionMethod'), value: ingress && t(`source.kind.${connectionKind(ingress)}`) },
      { label: t('source.provider'), value: ingress?.transport === 'relay' || relay ? 'Cloudflare Workers' : ingress && connectionProvider(ingress) },
      { label: t('setup.workerVersion'), value: relay?.workerVersion },
      { label: t('setup.hostedHere'), value: relay?.owner ? t('setup.hostedHere') : undefined },
      { label: t('accounts.controlSource'), value: count === undefined ? undefined : t(count ? 'source.count' : 'source.unused', { count }) },
    ]} />
    {(error || ingress?.error) && <Notice>{error || ingress?.error}</Notice>}
    {children}
  </EntityCard>;
}
