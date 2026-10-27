import type { ComponentProps } from 'react';
import type { ControlSource } from '../../../state/types';
import type { DispatchSummary, ProviderAccount } from '../../../types';
import { PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { Reference } from '../Reference';

export function SrcAccountChip({ source, account, provenance, onOpen, ...props }: Omit<ComponentProps<typeof Reference>, 'children' | 'referenceId'> & {
  source?: ControlSource; account?: ProviderAccount; provenance?: DispatchSummary['controlSource'];
}) {
  const label = account?.alias ?? source?.label ?? provenance?.label ?? provenance?.kind ?? '—';
  return <Reference {...props} onOpen={source ? onOpen : undefined}>
    <PlatformIcon role="source" platform={source?.product ?? provenance?.kind ?? ''} />
    <span>{label}</span>{source && <StateBadge variant="dot" presentation={statePresentation('source', source.pendingSwitch ? 'pending-switch' : source.state)} />}
  </Reference>;
}
