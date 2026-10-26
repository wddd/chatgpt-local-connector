import type { ControlSource, Ingress, OAuthRequest } from '../../../state/types';
import { AuthorizationRequestChip } from './Chip';

/** The source's active switch or bound credential is authoritative; never build grant history. */
export function sourceAuthorization(source: ControlSource, ingresses: readonly Ingress[]): Pick<OAuthRequest, 'clientName' | 'product' | 'status'> | undefined {
  const pendingId = source.pendingSwitch?.requestId;
  const ingress = ingresses.find(value => value.id === (source.pendingSwitch?.ingressId ?? source.ingressId));
  const request = ingress?.oauth?.pending.find(value => value.id === (pendingId ?? source.credential.grantId));
  if (request) return request;
  if (source.pendingSwitch) return { clientName: source.label, product: source.product, status: 'pending' };
  if (source.credential.type !== 'oauth-grant') return;
  const grant = ingress?.oauth?.grants.find(value => value.id === source.credential.grantId);
  return { clientName: grant?.clientName ?? source.label, product: source.product, status: grant && source.state !== 'revoked' ? 'approved' : 'unknown' };
}
export function SourceAuthorizationChip({ source, ingresses, onOpen, disabled }: { source: ControlSource; ingresses: readonly Ingress[]; onOpen?: () => void; disabled?: boolean }) {
  const request = sourceAuthorization(source, ingresses);
  return request && <AuthorizationRequestChip request={request} onOpen={onOpen} disabled={disabled} />;
}
