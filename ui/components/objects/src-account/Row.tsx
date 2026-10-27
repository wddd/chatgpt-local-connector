import type { ReactNode } from 'react';
import type { ControlSource, Ingress } from '../../../state/types';
import type { ProviderAccount } from '../../../types';
import { EntityRow, PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { TunnelChip } from '../tunnel/Chip';

export function SrcAccountRow({ source, account, sources = [source], ingress, onOpen, onConnection, selected, attention, disabled, actions }: {
  source: ControlSource; sources?: readonly ControlSource[]; account?: ProviderAccount; ingress?: Ingress; onOpen?: () => void; onConnection?: (id: string) => void;
  selected?: boolean; attention?: boolean; disabled?: boolean; actions?: ReactNode;
}) {
  return <EntityRow className="flex-wrap gap-2 [&_.entity-row-title]:wrap-anywhere [&_.entity-row-copy]:basis-30 [&_.sensitive-value]:max-w-full [&_.sensitive-value]:overflow-hidden [&_.status]:max-w-full [&_.status]:whitespace-normal [&>.actions]:min-w-0 [&>.actions]:max-w-full [&>.entity-row]:basis-72" data-remote-row={source.id} data-hover-target={account?.id ?? source.id}
    leading={<PlatformIcon role="source" platform={source.product} size={20} />} title={account?.alias ?? source.label}
    state={<>{[...new Set(sources.map(entry => entry.pendingSwitch ? 'pending-switch' : entry.state))].map(state => <StateBadge key={state} variant={state === 'connected' ? 'dot' : 'text'} presentation={statePresentation('source', state)} />)}</>}
    onClick={onOpen} chevron={!!onOpen} selected={selected} attention={attention} disabled={disabled}
    actions={<>{ingress && onConnection && <TunnelChip ingress={ingress} disabled={disabled} onOpen={() => onConnection(ingress.id)} />}{actions}</>} />;
}
