import type { Ingress } from '../../../state/types';
import { connectionIcon, connectionKind, connectionProvider, ingressState } from '../../../sourcePresentation';
import { t } from '../../../i18n';
import { EntityRow, Icon, StateBadge } from '../../ui';
import { Sensitive } from '../../Sensitive';
import { statePresentation } from '../statePresentation';

export function TunnelRow({ ingress }: { ingress: Ingress }) {
  const address = ingress.url || ingress.config.tunnelId;
  return <EntityRow className="flex-wrap gap-2 [&_.entity-row-title]:wrap-anywhere [&_.entity-row-copy]:basis-30 [&_.sensitive-value]:max-w-full [&_.sensitive-value]:overflow-hidden [&_.status]:max-w-full [&_.status]:whitespace-normal"
    leading={<Icon icon={connectionIcon(ingress)} size={20} />}
    title={<>{ingress.name} <span className="text-xs text-muted-foreground">{t(`source.kind.${connectionKind(ingress)}`)}</span></>}
    secondary={address ? <Sensitive>{address}</Sensitive> : connectionProvider(ingress)}
    state={<StateBadge presentation={statePresentation('connection', ingressState(ingress))} />} />;
}
