import type { ReactNode } from 'react';
import type { Ingress } from '../../../state/types';
import { connectionIcon, ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { EntityCard, Icon, Notice, StateBadge } from '../../ui';
import Address from '../../Address';
import { statePresentation } from '../statePresentation';

export function TunnelCard({ ingress, title, headerActions, busy, error }: {
  ingress: Ingress; title?: string; headerActions?: ReactNode; busy?: boolean; error?: string;
}) {
  return <EntityCard className="[&>.section-header]:flex-wrap [&>.section-header>.section-header-copy]:basis-30 [&>.section-header>.actions]:max-w-full" aria-busy={busy} icon={<Icon icon={connectionIcon(ingress)} size={20} />}
    title={title ?? ingress.name} headerActions={<><StateBadge presentation={statePresentation('connection', ingressState(ingress))} />{headerActions}</>}>
    <Address value={ingress.url} label={t('source.copyAddress')} disabled={busy} placeholder="—" />
    {(error || ingress.error) && <Notice>{error || ingress.error}</Notice>}
  </EntityCard>;
}
