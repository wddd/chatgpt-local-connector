import type { OAuthRequest } from '../../../state/types';
import { PlatformIcon, StateBadge } from '../../ui';
import { Reference } from '../Reference';
import { statePresentation } from '../statePresentation';
export function AuthorizationRequestChip({ request, onOpen, disabled }: { request: Pick<OAuthRequest, 'clientName' | 'product' | 'status'>; onOpen?: () => void; disabled?: boolean }) {
  const content = <>{request.product && <PlatformIcon platform={request.product} role="source" size={16} />}{request.clientName}<StateBadge variant="compact" presentation={statePresentation('authorization', request.status)} /></>;
  return <Reference onOpen={onOpen} disabled={disabled}>{content}</Reference>;
}
