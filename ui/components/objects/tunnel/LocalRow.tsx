import { Monitor } from 'lucide-react';
import type { Ingress } from '../../../state/types';
import { ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { EntityRow, Icon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';

export function LocalConnectionRow({ ingresses }: { ingresses?: readonly Ingress[] }) {
  const local = ingresses?.filter(entry => entry.transport === 'local');
  const states: string[] = local?.map(ingressState) ?? [];
  const state = !local ? 'unknown' : ['connectionError', 'connectingLabel', 'connected', 'disconnected'].find(value => states.includes(value)) ?? 'disabled';
  return <EntityRow title={t('source.kind.local')} leading={<Icon icon={Monitor} size={20} />}
    state={<StateBadge presentation={statePresentation('connection', state)} />} />;
}
