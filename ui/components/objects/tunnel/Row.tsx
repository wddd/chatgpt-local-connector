import type { ReactNode } from 'react';
import type { ControlSource, Ingress } from '../../../state/types';
import { connectionIcon, connectionKind, connectionProvider, ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { EntityRow, Icon, StateBadge } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { statePresentation } from '../statePresentation';
import '../objects.css';

export function TunnelRow({ ingress, sources, onOpen, selected, disabled, attention, constraint, actions }: {
  ingress: Ingress; sources: readonly ControlSource[]; onOpen?: () => void; selected?: boolean; disabled?: boolean; attention?: boolean; constraint?: string; actions?: ReactNode;
}) {
  const count = sources.filter(source => source.ingressId === ingress.id).length;
  return <EntityRow className="object-row" data-remote-row={ingress.id} data-hover-target={ingress.id} selected={selected} attention={attention}
    disabled={disabled} onClick={onOpen} chevron={!!onOpen} leading={<Icon icon={connectionIcon(ingress)} size={20} />}
    title={<>{ingress.name} <span className="object-chip-kind">{t(`source.kind.${connectionKind(ingress)}`)}</span></>}
    secondary={constraint || (ingress.url ? <Sensitive>{ingress.url}</Sensitive> : connectionProvider(ingress))}
    state={<><span className="muted small">{t(count ? 'source.count' : 'source.unused', { count })}</span><StateBadge presentation={statePresentation('connection', ingressState(ingress))} /></>} actions={actions} />;
}
