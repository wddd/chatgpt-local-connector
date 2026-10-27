import type { ComponentProps } from 'react';
import type { Ingress } from '../../../state/types';
import { connectionIcon, connectionKind, ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { Icon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
import { Reference } from '../Reference';

export function TunnelChip({ ingress, missingName, onOpen, ...props }: Omit<ComponentProps<typeof Reference>, 'children' | 'referenceId'> & { ingress?: Ingress; missingName?: string }) {
  return <Reference {...props} referenceId={ingress?.id} onOpen={ingress ? onOpen : undefined}>
    {ingress && <Icon icon={connectionIcon(ingress)} />}
    <span>{ingress?.name ?? missingName ?? t('source.connectionRemoved')}</span>
    {ingress && <><span className="text-xs text-muted-foreground">{t(`source.kind.${connectionKind(ingress)}`)}</span><StateBadge variant="dot" presentation={statePresentation('connection', ingressState(ingress))} /></>}
  </Reference>;
}
