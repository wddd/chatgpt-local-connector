import type { ReactNode } from 'react';
import type { ControlSource, Ingress } from '../../../state/types';
import { connectionIcon, connectionKind, connectionProvider, ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { EntityRow, Icon, StateBadge } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { statePresentation } from '../statePresentation';

export function TunnelRow({ ingress, sources, onOpen, selected, disabled, attention, constraint, actions }: {
  ingress: Ingress; sources: readonly ControlSource[]; onOpen?: () => void; selected?: boolean; disabled?: boolean; attention?: boolean; constraint?: string; actions?: ReactNode;
}) {
  const count = sources.filter(source => source.ingressId === ingress.id).length;
  return <EntityRow className="flex-wrap gap-2 [&_.entity-row-title]:wrap-anywhere [&_.entity-row-copy]:basis-30 [&_.sensitive-value]:max-w-full [&_.sensitive-value]:overflow-hidden [&_.status]:max-w-full [&_.status]:whitespace-normal [&>.actions]:min-w-0 [&>.actions]:max-w-full [&>.entity-row]:basis-72" data-remote-row={ingress.id} data-hover-target={ingress.id} selected={selected} attention={attention}
    disabled={disabled} onClick={onOpen} chevron={!!onOpen} leading={<Icon icon={connectionIcon(ingress)} size={20} />}
    title={<>{ingress.name} <span className="text-xs text-muted-foreground">{t(`source.kind.${connectionKind(ingress)}`)}</span></>}
    secondary={constraint || (ingress.url ? <Sensitive>{ingress.url}</Sensitive> : connectionProvider(ingress))}
    state={<><span className="text-xs text-muted-foreground">{t(count ? 'source.count' : 'source.unused', { count })}</span><StateBadge presentation={statePresentation('connection', ingressState(ingress))} /></>} actions={actions} />;
}
