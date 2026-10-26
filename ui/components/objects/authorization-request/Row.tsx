import { locale, t } from '../../../i18n';
import type { OAuthRequest, ControlSource } from '../../../state/types';
import { EntityRow, PlatformIcon, StateBadge } from '../../ui';
import { statePresentation } from '../statePresentation';
export function AuthorizationRequestRow({ request, source, onOpen, disabled, selected }: { request: OAuthRequest; source?: ControlSource; onOpen: () => void; disabled?: boolean; selected?: boolean }) {
  return <EntityRow title={request.clientName} secondary={<>{source?.label}{request.expiresAt !== undefined && <time dateTime={new Date(request.expiresAt * 1000).toISOString()}>{source?.label && ' · '}{t('authorization.expires', { time: new Date(request.expiresAt * 1000).toLocaleString(locale.get()) })}</time>}</>} leading={request.product && <PlatformIcon platform={request.product} role="source" size={20} />} state={<StateBadge presentation={statePresentation('authorization', request.status)} />} onClick={onOpen} disabled={disabled} selected={selected} attention={request.status === 'pending'} />;
}
