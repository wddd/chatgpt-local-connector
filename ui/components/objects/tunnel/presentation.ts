import type { WireState } from '../../../topology/render';
import { statePresentation } from '../statePresentation';

/** A wire is already projected; it never invents an Ingress association. */
export function tunnelWirePresentation(state: WireState) {
  return statePresentation('connection', { normal: 'connected', connecting: 'connectingLabel', error: 'connectionError', inactive: 'disconnected' }[state]);
}
