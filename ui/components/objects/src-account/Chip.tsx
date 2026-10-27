import type { ComponentProps } from 'react';
import type { ControlSource } from '../../../state/types';
import type { DispatchSummary, ProviderAccount } from '../../../types';
import { Terminal } from 'lucide-react';
import { t } from '../../../i18n';
import { Icon, PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { Reference } from '../Reference';

export function SrcAccountChip({ source, account, provenance, onOpen, ...props }: Omit<ComponentProps<typeof Reference>, 'children' | 'referenceId'> & {
  source?: ControlSource; account?: ProviderAccount; provenance?: DispatchSummary['controlSource'];
}) {
  const label = account?.alias ?? source?.label ?? provenance?.label ?? (provenance?.kind === 'local-cli' ? t('localCli') : provenance?.kind) ?? '—';
  if (provenance && !source) return <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
    {provenance.kind === 'local-cli' ? <Icon icon={Terminal} /> : <PlatformIcon role="source" platform={provenance.kind ?? ''} size={16} />}<span>{label}</span>
  </span>;
  return <Reference {...props} onOpen={source ? onOpen : undefined}>
    {provenance?.kind === 'local-cli' ? <Icon icon={Terminal} /> : <PlatformIcon role="source" platform={source?.product ?? provenance?.kind ?? ''} size={16} />}
    <span>{label}</span>{source && <StateBadge variant="dot" presentation={statePresentation('source', source.pendingSwitch ? 'pending-switch' : source.state)} />}
  </Reference>;
}
